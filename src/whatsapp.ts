import makeWASocket, {
	DisconnectReason,
	downloadMediaMessage,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
} from "baileys";
import type { ConnectionState, SocketConfig, WASocket, proto } from "baileys";
import { Store, useSession } from "./store";
import { prisma } from "./db";
import type { WebSocket } from "ws";
import { logger } from "./shared";
import type { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { delay } from "./utils";
import dotenv from "dotenv";
import { callWebHook, callWebHookFile } from "./fetch";
import parsePhoneNumber from "libphonenumber-js";

dotenv.config();

type Session = WASocket & {
	destroy: () => Promise<void>;
	store: Store;
};

const sessions = new Map<string, Session>();
const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 5);
const SESSION_CONFIG_ID = "session-config";

export async function init() {
	const sessions = await prisma.session.findMany({
		select: { sessionId: true, data: true },
		where: { id: { startsWith: SESSION_CONFIG_ID } },
	});

	for (const { sessionId, data } of sessions) {
		const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
		createSession({ sessionId, readIncomingMessages, socketConfig });
	}
}

function shouldReconnect(sessionId: string) {
	let attempts = retries.get(sessionId) ?? 0;

	if (attempts < MAX_RECONNECT_RETRIES) {
		attempts += 1;
		retries.set(sessionId, attempts);
		return true;
	}
	return false;
}

type createSessionOptions = {
	sessionId: string;
	res?: Response;
	SSE?: boolean;
	readIncomingMessages?: boolean;
	socketConfig?: SocketConfig;
};

export async function createSession(options: createSessionOptions) {
	const { sessionId, res, SSE = false, readIncomingMessages = false, socketConfig } = options;
	const configID = `${SESSION_CONFIG_ID}-${sessionId}`;
	let connectionState: Partial<ConnectionState> = { connection: "close" };

	const destroy = async (logout = true) => {
		try {
			await Promise.allSettled([
				logout && socket.logout(),
				prisma.chat.deleteMany({ where: { sessionId } }),
				prisma.contact.deleteMany({ where: { sessionId } }),
				prisma.message.deleteMany({ where: { sessionId } }),
				prisma.groupMetadata.deleteMany({ where: { sessionId } }),
				prisma.session.deleteMany({ where: { sessionId } }),
				prisma.webhook.deleteMany({ where: { sessionId } }),
			]);
			logger.info({ session: sessionId }, "Session destroyed");
		} catch (e) {
			logger.error(e, "An error occurred during session destroy");
		} finally {
			sessions.delete(sessionId);
		}
	};

	const handleConnectionClose = () => {
		const code = (connectionState.lastDisconnect?.error as Boom)?.output?.statusCode;
		const restartRequired = code === DisconnectReason.restartRequired;
		const doNotReconnect = !shouldReconnect(sessionId);

		if (code === DisconnectReason.loggedOut || doNotReconnect) {
			if (res) {
				if (!SSE && !res.headersSent) {
					res.status(500).json({ error: "Unable to create session" });
				}
				res.end();
			}
			destroy(doNotReconnect);
			return;
		}

		if (!restartRequired) {
			logger.info({ attempts: retries.get(sessionId) ?? 1, sessionId }, "Reconnecting...");
		}
		setTimeout(() => createSession(options), restartRequired ? 0 : RECONNECT_INTERVAL);
	};

	const handleNormalConnectionUpdate = async () => {
		if (connectionState.qr?.length) {
			console.log("QR", connectionState.qr);
			console.log("res.headersSent", !res?.headersSent);

			if (res) {
				try {
					const qr = await toDataURL(connectionState.qr);
					res.status(200).json({ qr });
					return;
				} catch (e) {
					logger.error(e, "An error occurred during QR generation");
					res.status(500).json({ error: "Unable to generate QR" });
				}
			}
			destroy();
		}
	};

	const handleSSEConnectionUpdate = async () => {
		let qr: string | undefined = undefined;
		if (connectionState.qr?.length) {
			try {
				qr = await toDataURL(connectionState.qr);
			} catch (e) {
				logger.error(e, "An error occurred during QR generation");
			}
		}

		const currentGenerations = SSEQRGenerations.get(sessionId) ?? 0;
		if (!res || res.writableEnded || (qr && currentGenerations >= SSE_MAX_QR_GENERATION)) {
			if (res && !res.writableEnded) {
				res.end();
			}
			destroy();
			return;
		}

		const data = { ...connectionState, qr };
		if (qr) SSEQRGenerations.set(sessionId, currentGenerations + 1);
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;
	const { state, saveCreds } = await useSession(sessionId);
	const socket = makeWASocket({
		printQRInTerminal: false,
		//browser: [process.env.NAME_BOT_BROWSER || "Whatsapp Bot", "Chrome", "3.0"],
		generateHighQualityLinkPreview: false,
		...socketConfig,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		logger,
		shouldIgnoreJid: (jid) => isJidBroadcast(jid),
		getMessage: async (key) => {
			const data = await prisma.message.findFirst({
				where: { remoteJid: key.remoteJid!, id: key.id!, sessionId },
			});
			return (data?.message || undefined) as proto.IMessage | undefined;
		},
	});

	const store = new Store(sessionId, socket.ev);
	sessions.set(sessionId, { ...socket, destroy, store });

	socket.ev.on("creds.update", saveCreds);
	socket.ev.on("connection.update", (update) => {
		connectionState = update;
		const { connection } = update;

		if (connection === "open") {
			retries.delete(sessionId);
			SSEQRGenerations.delete(sessionId);
		}
		if (connection === "close") handleConnectionClose();
		handleConnectionUpdate();
	});

	if (readIncomingMessages) {
		socket.ev.on("messages.upsert", async (m) => {
			const message = m.messages[0];
			if (message.key.fromMe || m.type !== "notify") return;

			await delay(1000);
			await socket.readMessages([message.key]);
		});
	}

	// Manejo de mensajes y envío a webhooks
	socket.ev.on("messages.upsert", async (m) => {
		const message = m.messages[0];
		if (!m.messages || !message.message) return;

		const textMessageTypes = [
			"conversation",
			"extendedTextMessage",
			"buttonsResponseMessage",
			"listResponseMessage",
			"contactMessage",
			"locationMessage",
			"liveLocationMessage",
		];
		const documentMessageTypes = ["imageMessage", "documentMessage", "audioMessage"];

		const messageType = Object.keys(message.message).find(
			(value) =>
				textMessageTypes.includes(value as keyof typeof message.message) ||
				documentMessageTypes.includes(value as keyof typeof message.message),
		) as keyof typeof message.message | undefined;

		if (!messageType) return;

		const messageContent = message.message[messageType];

		let text = "";

		if (typeof messageContent === "string") {
			text = messageContent;
		} else if (messageContent && "text" in messageContent) {
			text = messageContent.text ?? "";
		}

		try {
			const webhooks = await prisma.webhook.findMany({ where: { sessionId } });

			const webhookPromises = webhooks.map(async (webhook) => {
				if (textMessageTypes.includes(messageType)) {
					return callWebHook(webhook.url, {
						message,
						messageContent,
						messageType,
						session: sessionId,
						type: "text",
						text,
					});
				} else if (documentMessageTypes.includes(messageType)) {
					const buffer = await downloadMediaMessage(
						message,
						"buffer",
						{},
						{
							logger,
							reuploadRequest: socket.updateMediaMessage,
						},
					);
					return callWebHookFile(
						webhook.url,
						{
							message,
							messageContent,
							messageType,
							session: sessionId,
							type: "file",
							text,
						},
						buffer,
					);
				}
			});

			await Promise.allSettled(webhookPromises);
			logger.info("Message sent to webhooks");
		} catch (error) {
			logger.error(error, "Failed to send message to webhooks");
		}
	});

	await prisma.session.upsert({
		create: {
			id: configID,
			sessionId,
			data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
		},
		update: {},
		where: { sessionId_id: { id: configID, sessionId } },
	});
}

export function getSessionStatus(session: Session) {
	const state = ["CONNECTING", "CONNECTED", "DISCONNECTING", "DISCONNECTED"];
	let status = state[(session.ws as unknown as WebSocket).readyState];
	status = session.user ? "AUTHENTICATED" : status;
	return status;
}

export function listSessions() {
	return Array.from(sessions.entries()).map(([id, session]) => ({
		id,
		status: getSessionStatus(session),
	}));
}

export function getSession(sessionId: string) {
	return sessions.get(sessionId);
}

export async function deleteSession(sessionId: string) {
	sessions.get(sessionId)?.destroy();
}

export function sessionExists(sessionId: string) {
	return sessions.has(sessionId);
}

function formatPhoneNumber(phoneNumber: string) {
	const defaultCountry = "PE"; // Código de país de Perú
	const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);
	if (parsedNumber) {
		return parsedNumber.number.replace("+", "");
	}
}

export async function jidExists(
	session: Session,
	jid: string,
	type: "group" | "number" = "number",
): Promise<{ exists: boolean; formatJid: string }> {
	try {
		const formatJid = (jid: string) =>
			jid.includes("@") ? jid : `${formatPhoneNumber(jid)}@s.whatsapp.net`;

		if (type === "number") {
			const formattedJid = formatJid(jid);
			const results = await session.onWhatsApp(formattedJid);
			const result = results?.[0];
			return { exists: !!result?.exists, formatJid: formattedJid };
		}

		const groupMeta = await session.groupMetadata(jid);
		return { exists: !!groupMeta.id, formatJid: jid };
	} catch (e) {
		return Promise.reject(e);
	}
}
