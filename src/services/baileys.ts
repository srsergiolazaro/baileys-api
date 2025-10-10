import { v4 as uuidv4 } from "uuid";

import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
} from "baileys";
import type { ConnectionState, SocketConfig, WASocket, proto } from "baileys";
import { Store, useSession } from "../store";
import { prisma } from "../db";
import { logger } from "../shared";
import type { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { sessionsMap } from "./session";
import { handleMessagesUpsert, handleGroupParticipantsUpdate } from "./handlers";

const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 5);
const SESSION_CONFIG_ID = "session-config";

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
	sessionId?: string;
	userId: string;
	res?: Response;
	SSE?: boolean;
	readIncomingMessages?: boolean;
	socketConfig?: SocketConfig;
};

export async function createSession(options: createSessionOptions) {
	const {
		sessionId = uuidv4(),
		userId,
		res,
		SSE = false,
		readIncomingMessages = false,
		socketConfig,
	} = options;
	if (res && !res.writableEnded) {
		res.write("sessionId " + sessionId);
	}

	logger.info("createSession: start", {
		sessionId,
		userId,
		SSE,
		readIncomingMessages,
		hasSocketConfig: !!socketConfig,
	});
	// Ensure one UserSession per user atomically (avoids race conditions)
	await prisma.userSession.upsert({
		where: { userId },
		update: {
			sessionId,
			status: "active",
			deviceName: "WhatsApp User",
			lastActive: new Date(),
			updatedAt: new Date(),
		},
		create: {
			id: sessionId,
			sessionId,
			userId,
			status: "active",
			phoneNumber: null,
			deviceName: "WhatsApp User",
			createdAt: new Date(),
			updatedAt: new Date(),
			lastActive: new Date(),
		},
	});

	logger.info("createSession: userSession upserted", { sessionId, userId });
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
				prisma.userSession.delete({ where: { sessionId } }),
				prisma.webhook.deleteMany({ where: { sessionId } }),
			]);
			logger.info("Session destroyed", { session: sessionId });
		} catch (e) {
			logger.error("An error occurred during session destroy", e);
		} finally {
			sessionsMap.delete(sessionId);
		}
	};

	const handleConnectionClose = () => {
		const lastErr = connectionState.lastDisconnect?.error as Boom | undefined;
		const code = lastErr?.output?.statusCode;
		const restartRequired = code === DisconnectReason.restartRequired;
		const doNotReconnect = !shouldReconnect(sessionId);

		logger.info("connection.close", {
			sessionId,
			code,
			restartRequired,
			doNotReconnect,
			attempts: retries.get(sessionId) ?? 1,
			message: (lastErr as any)?.message,
		});

		if (code === DisconnectReason.connectionReplaced) {
			logger.warn(
				{ sessionId },
				"Connection replaced. You have been logged out because another session has been started elsewhere.",
			);
		} else if (code === DisconnectReason.loggedOut) {
			logger.warn("Connection logged out. You have been logged out.", { sessionId });
		}

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
			logger.info("Reconnecting...", { attempts: retries.get(sessionId) ?? 1, sessionId });
		}
		setTimeout(
			() => createSession({ ...options, sessionId }),
			restartRequired ? 0 : RECONNECT_INTERVAL,
		);
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
				logger.error("An error occurred during QR generation", e);
				res.status(500).json({ error: "Unable to generate QR" });
			}
		}
		destroy();
		}
	};

	const handleSSEConnectionUpdate = async () => {
		logger.info("SSE Connection Update", {
			sessionId,
			connectionState,
			hasResponse: !!res,
			responseEnded: res?.writableEnded,
			currentGenerations: SSEQRGenerations.get(sessionId) ?? 0,
		});

		let qr: string | undefined = undefined;
		if (connectionState.qr?.length) {
			try {
				qr = await toDataURL(connectionState.qr);
				logger.info("QR code generated", {
					sessionId,
					qrLength: connectionState.qr.length,
					qrGenerated: !!qr,
				});
			} catch (e) {
				logger.error("An error occurred during QR generation", e);
			}
		}

		const currentGenerations = SSEQRGenerations.get(sessionId) ?? 0;
		if (!res || res.writableEnded || (qr && currentGenerations >= SSE_MAX_QR_GENERATION)) {
			logger.info("SSE connection ending", {
				sessionId,
				hasResponse: !!res,
				responseEnded: res?.writableEnded,
				qrGenerated: !!qr,
				currentGenerations,
				maxGenerations: SSE_MAX_QR_GENERATION,
			});

			if (res && !res.writableEnded) {
				res.end();
			}
			destroy();
			return;
		}

		const data = { ...connectionState, qr };
		if (qr) {
			SSEQRGenerations.set(sessionId, currentGenerations + 1);
		}

		try {
			const message = `data: ${JSON.stringify(data)}\n\n`;
			res.write(message);
			logger.info("SSE message sent", {
				sessionId,
				messageLength: message.length,
				hasQr: !!qr,
			});
		} catch (e) {
			logger.error("Error writing SSE message", e);
			if (res && !res.writableEnded) {
				res.end();
			}
			destroy();
		}
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;
	const { state, saveCreds } = await useSession(sessionId);
	const socket = makeWASocket({
		printQRInTerminal: false,
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
	sessionsMap.set(sessionId, { ...socket, destroy, store });

	socket.ev.on("creds.update", saveCreds);
		socket.ev.on("connection.update", (update) => {
			connectionState = update;
			const { connection } = update;
			logger.info("connection.update", { sessionId, connection, hasRes: !!res, SSE });

		if (connection === "open") {
			retries.delete(sessionId);
			SSEQRGenerations.delete(sessionId);
			if (res && !res.writableEnded) {
				res.end();
				return;
			}
		}
		if (connection === "close") handleConnectionClose();
		handleConnectionUpdate();
	});

	socket.ev.on("messages.upsert", (m) =>
		handleMessagesUpsert(socket, m, sessionId, readIncomingMessages),
	);
	socket.ev.on("group-participants.update", (c) =>
		handleGroupParticipantsUpdate(socket, c, sessionId),
	);

	try {
	await prisma.session.upsert({
		create: {
			sessionId,
			id: configID,
			data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
			userId,
		},
		update: {
			data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
			userId,
		},
		where: {
			sessionId_id: {
				sessionId,
				id: configID,
			},
		},
	});
	logger.info("createSession: session-config upserted", { sessionId });
	} catch (e) {
		logger.error("createSession: failed to upsert session-config", e);
		throw e;
	}
}
