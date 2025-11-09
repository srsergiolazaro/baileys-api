import { v4 as uuidv4 } from "uuid";
import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
} from "baileys";
import type { ConnectionState, SocketConfig } from "baileys";
import { Store, useSession } from "../store";
import { prisma } from "../db";
import { logger } from "../shared";
import type { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { sessionsMap } from "./session";
import { handleMessagesUpsert, handleGroupParticipantsUpdate } from "./handlers";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

// ------------------------------
// Variables globales de control
// ------------------------------
const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();
const connectingSessions = new Set<string>();
const failHistory = new Map<string, number[]>();

const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 5);
const SESSION_CONFIG_ID = "session-config";

const BACKOFF_BASE_MS = Number(process.env.BACKOFF_BASE_MS || 5000);
const BACKOFF_MAX_MS = Number(process.env.BACKOFF_MAX_MS || 300000);
const COOLDOWN_AFTER_FAILS = Number(process.env.COOLDOWN_AFTER_FAILS || 3);
const COOLDOWN_WINDOW_MS = Number(process.env.COOLDOWN_WINDOW_MS || 60000);
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 1800000);

// ------------------------------
// Funciones auxiliares
// ------------------------------
function isConnectionClosedError(error: unknown): error is Boom {
	if (!error || typeof error !== "object") return false;
	const boomError = error as Boom;
	return (
		Boolean(boomError?.isBoom) && boomError.output?.statusCode === DisconnectReason.connectionClosed
	);
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

function nextBackoffMs(sessionId: string) {
	const attempts = retries.get(sessionId) ?? 0;
	const exp = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)), BACKOFF_MAX_MS);
	const jitter = exp * (0.5 + Math.random());
	return Math.round(jitter);
}

function recordFailure(sessionId: string) {
	const now = Date.now();
	const arr = failHistory.get(sessionId) ?? [];
	arr.push(now);
	const fresh = arr.filter((t) => now - t <= COOLDOWN_WINDOW_MS);
	failHistory.set(sessionId, fresh);
	return fresh.length >= COOLDOWN_AFTER_FAILS;
}

function shouldReconnectByCode(code?: number) {
	switch (code) {
		case DisconnectReason.loggedOut:
		case DisconnectReason.connectionReplaced:
		case DisconnectReason.badSession:
		case DisconnectReason.multideviceMismatch:
			return false;
		default:
			return true;
	}
}

// ------------------------------
// Tipo de opciones
// ------------------------------
type createSessionOptions = {
	sessionId?: string;
	userId: string;
	res?: Response;
	SSE?: boolean;
	readIncomingMessages?: boolean;
	socketConfig?: SocketConfig;
};

// ------------------------------
// Función principal
// ------------------------------
export async function createSession(options: createSessionOptions) {
	const {
		sessionId = uuidv4(),
		userId,
		res,
		SSE = false,
		readIncomingMessages = false,
		socketConfig,
	} = options;

	// Evita sesiones duplicadas concurrentes
	if (connectingSessions.has(sessionId)) {
		logger.warn("createSession: already connecting, skipping duplicate", {
			sessionId,
			userId,
		});
		return;
	}
	connectingSessions.add(sessionId);
	const clearConnecting = () => connectingSessions.delete(sessionId);

	if (res && !res.writableEnded) res.write("sessionId " + sessionId);

	logger.info("createSession: start", {
		sessionId,
		userId,
		SSE,
		readIncomingMessages,
		hasSocketConfig: !!socketConfig,
	});

	// ---------------------------
	// Creación / actualización DB
	// ---------------------------
	const now = new Date();
	try {
		const session = await prisma.userSession.findFirst({
			where: { sessionId },
		});

		if (session) {
			await prisma.userSession.update({
				where: { id: session.id },
				data: { status: "active", lastActive: now, updatedAt: now },
			});
		} else {
			await prisma.userSession.create({
				data: {
					sessionId,
					userId,
					status: "active",
					deviceName: "WhatsApp User",
					phoneNumber: null,
					createdAt: now,
					updatedAt: now,
					lastActive: now,
				},
			});
		}
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				logger.warn("UserSession missing; recreating", { sessionId, userId });
				await prisma.userSession.create({
					data: {
						id: sessionId,
						sessionId,
						userId,
						status: "active",
						phoneNumber: null,
						deviceName: "WhatsApp User",
						createdAt: now,
						updatedAt: now,
						lastActive: now,
					},
				});
			} else if (error.code === "P2002") {
				logger.warn("Unique conflict; attempting direct update", {
					sessionId,
					userId,
				});
				await prisma.userSession.update({
					where: { sessionId },
					data: {
						userId,
						status: "active",
						deviceName: "WhatsApp User",
						lastActive: now,
						updatedAt: now,
					},
				});
			} else throw error;
		} else throw error;
	}

	logger.info("createSession: userSession upserted", { sessionId, userId });
	const configID = `${SESSION_CONFIG_ID}-${sessionId}`;
	let connectionState: Partial<ConnectionState> = { connection: "close" };

	// ---------------------------
	// Función destroy
	// ---------------------------
	const destroy = async (logout = true) => {
		try {
			await Promise.allSettled([
				logout && socket.logout(),
				prisma.chat.deleteMany({ where: { sessionId } }),
				prisma.contact.deleteMany({ where: { sessionId } }),
				prisma.message.deleteMany({ where: { sessionId } }),
				prisma.groupMetadata.deleteMany({ where: { sessionId } }),
				prisma.userSession.deleteMany({ where: { sessionId } }),
				prisma.webhook.deleteMany({ where: { sessionId } }),
			]);
			logger.info("Session destroyed", { session: sessionId });
		} catch (e) {
			logger.error("An error occurred during session destroy", e);
		} finally {
			sessionsMap.delete(sessionId);
			clearConnecting();
		}
	};

	// ---------------------------
	// Reconexión controlada
	// ---------------------------
	const handleConnectionClose = () => {
		const lastErr = connectionState.lastDisconnect?.error as Boom | undefined;
		const code = lastErr?.output?.statusCode;
		const restartRequired = code === DisconnectReason.restartRequired;
		const doNotReconnect = !shouldReconnect(sessionId);
		const allowedByCode = shouldReconnectByCode(code);

		logger.info("connection.close", {
			sessionId,
			code,
			restartRequired,
			doNotReconnect: doNotReconnect || !allowedByCode,
			attempts: retries.get(sessionId) ?? 1,
			message: (lastErr as any)?.message,
		});

		if (!allowedByCode || code === DisconnectReason.loggedOut || doNotReconnect) {
			if (res) {
				if (!SSE && !res.headersSent) res.status(500).json({ error: "Unable to create session" });
				res.end();
			}
			destroy(doNotReconnect);
			return;
		}

		let delay = restartRequired
			? 0
			: RECONNECT_INTERVAL > 0
				? RECONNECT_INTERVAL
				: nextBackoffMs(sessionId);

		const cooldownTriggered = recordFailure(sessionId);
		if (cooldownTriggered) {
			delay = Math.max(delay, COOLDOWN_MS);
			logger.warn("Too many failures, entering cooldown", {
				sessionId,
				delayMs: delay,
				failures: failHistory.get(sessionId)?.length,
			});
		} else {
			logger.info("Reconnecting with backoff", {
				sessionId,
				attempts: retries.get(sessionId) ?? 1,
				delayMs: delay,
			});
		}

		clearConnecting();
		setTimeout(() => createSession({ ...options, sessionId }), delay);
	};

	// ---------------------------
	// QR / SSE updates
	// ---------------------------
	const handleNormalConnectionUpdate = async () => {
		if (!connectionState.qr?.length) return;

		if (res && !res.writableEnded) {
			try {
				const qr = await toDataURL(connectionState.qr);
				res.status(200).json({ qr, sessionId });
			} catch (e) {
				logger.error("QR generation error", e);
				res.status(500).json({ error: "Unable to generate QR" });
			}
			return;
		}

		logger.warn("QR generated but no response channel", { sessionId });
	};

	const handleSSEConnectionUpdate = async () => {
		logger.info("SSE Connection Update", {
			sessionId,
			connectionState,
			hasResponse: !!res,
			responseEnded: res?.writableEnded,
			currentGenerations: SSEQRGenerations.get(sessionId) ?? 0,
		});

		let qr: string | undefined;
		if (connectionState.qr?.length) {
			try {
				qr = await toDataURL(connectionState.qr);
				logger.info("QR code generated", {
					sessionId,
					qrLength: connectionState.qr.length,
				});
			} catch (e) {
				logger.error("QR generation failed", e);
			}
		}

		const currentGenerations = SSEQRGenerations.get(sessionId) ?? 0;
		if (!res || res.writableEnded || (qr && currentGenerations >= SSE_MAX_QR_GENERATION)) {
			logger.info("SSE connection ending", { sessionId });
			if (res && !res.writableEnded) res.end();
			return;
		}

		const data = { ...connectionState, qr };
		if (qr) SSEQRGenerations.set(sessionId, currentGenerations + 1);

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
			if (res && !res.writableEnded) res.end();
			destroy();
		}
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;

	// ---------------------------
	// Socket creation
	// ---------------------------
	const { state, saveCreds } = await useSession(sessionId);
	const socket = makeWASocket({
		printQRInTerminal: false,
		generateHighQualityLinkPreview: false,
		markOnlineOnConnect: false,
		connectTimeoutMs: 30000,
		keepAliveIntervalMs: 25000,
		browser: socketConfig?.browser ?? (["Mac OS", "Chrome", "119.0.0.0"] as any),
		...socketConfig,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		logger,
		shouldIgnoreJid: (jid) => isJidBroadcast(jid),
	});

	const store = new Store(sessionId, socket.ev);
	sessionsMap.set(sessionId, { ...socket, destroy, store });

	const originalSendRetryRequest = socket.sendRetryRequest.bind(socket);
	socket.sendRetryRequest = async (...args) => {
		try {
			await originalSendRetryRequest(...args);
		} catch (error) {
			if (isConnectionClosedError(error)) {
				logger.warn({ sessionId }, "sendRetryRequest skipped (connection already closed)");
				return;
			}
			throw error;
		}
	};

	socket.ev.on("creds.update", saveCreds);
	socket.ev.on("connection.update", (update) => {
		connectionState = update;
		const { connection } = update;
		logger.info("connection.update", { sessionId, connection, hasRes: !!res, SSE });

		if (connection === "open") {
			retries.delete(sessionId);
			failHistory.delete(sessionId);
			SSEQRGenerations.delete(sessionId);
			clearConnecting();
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
	socket.ev.on("lid-mapping.update", ({ lid, pn }) =>
		logger.debug({ sessionId, lid, pn }, "Received lid-mapping update"),
	);

	// ---------------------------
	// Guardar config en DB
	// ---------------------------
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
				sessionId_id: { sessionId, id: configID },
			},
		});
		logger.info("createSession: session-config upserted", { sessionId });
	} catch (e) {
		logger.error("createSession: failed to upsert session-config", e);
		throw e;
	}
}
