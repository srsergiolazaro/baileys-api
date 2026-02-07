import { v4 as uuidv4 } from "uuid";

import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	jidDecode,
} from "baileys";
import type { ConnectionState, GroupParticipant, ParticipantAction, SocketConfig } from "baileys";
import { Store, useSession, clearSessionCache } from "../store";
import { prisma } from "../db";
import { AccountType } from "@prisma/client";
import { logger } from "../shared";
import type { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { sessionsMap, setRestartingLock, clearRestartingLock, sessionExists } from "./session";
// DESHABILITADO: Handlers de webhooks desactivados para reducir queries a DB
// import { handleMessagesUpsert, handleGroupParticipantsUpdate } from "./handlers";

const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 5);

// Pre-key management: prevent excessive generation
// Signal protocol typically needs ~100 pre-keys, having 300+ means we don't need more
const PRE_KEY_SUFFICIENT_THRESHOLD = 300;

/**
 * Count existing pre-keys for a session
 */
async function countPreKeys(sessionId: string): Promise<number> {
	const result = await prisma.session.count({
		where: {
			sessionId,
			id: { startsWith: "pre-key-" },
		},
	});
	return result;
}

function isConnectionClosedError(error: unknown): error is Boom {
	if (!error || typeof error !== "object") return false;
	const boomError = error as Boom;
	return (
		Boolean((boomError as Boom)?.isBoom) &&
		boomError.output?.statusCode === DisconnectReason.connectionClosed
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

type createSessionOptions = {
	sessionId?: string;
	userId: string;
	res?: Response;
	SSE?: boolean;
	readIncomingMessages?: boolean;
	socketConfig?: SocketConfig;
	deviceName?: string;
};

export async function createSession(options: createSessionOptions) {
	const {
		sessionId = uuidv4(),
		userId,
		res,
		SSE = false,
		readIncomingMessages = false,
		socketConfig,
		deviceName = "WhatsApp User",
	} = options;

	// ============================================================
	// 🛡️ PREVENCIÓN DE SESIONES DUPLICADAS
	// ============================================================
	if (sessionExists(sessionId)) {
		logger.warn("createSession: Session already exists, skipping", { sessionId });
		if (res && !res.headersSent && !SSE) {
			return res.status(409).json({ error: "Session already exists", sessionId });
		}
		return { error: "Session already exists", sessionId };
	}

	if (!setRestartingLock(sessionId)) {
		logger.warn("createSession: Session is already initializing, skipping", { sessionId });
		if (res && !res.headersSent && !SSE) {
			return res.status(429).json({ error: "Session is already initializing", sessionId });
		}
		return { error: "Session is already initializing", sessionId };
	}

	// ============================================================
	// 🔐 VALIDACIÓN SSE — SOLO EN MODO SSE
	// ============================================================
	if (SSE) {
		try {
			if (!res || res.writableEnded) {
				logger.error("SSE habilitado pero no hay response válido", { sessionId });
				clearRestartingLock(sessionId);
				return { error: "SSE channel unavailable", sessionId: null };
			}

			// Primer mensaje SSE obligatorio
			res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
			logger.info("SSE inicial enviado correctamente", { sessionId });

		} catch (e) {
			logger.error("❌ Error inicial SSE. NO se creará la sesión.", {
				sessionId,
				error: (e as any)?.message,
			});

			if (res && !res.writableEnded) res.end();
			clearRestartingLock(sessionId);
			return { error: "SSE initialization failed", sessionId: null };
		}
	}

	logger.info("createSession: start", {
		sessionId,
		userId,
		SSE,
		readIncomingMessages,
		hasSocketConfig: !!socketConfig,
	});

	// ============================================================
	// 🔥 DESTRUCCIÓN COMPLETA DE SESIÓN
	// ============================================================
	let connectionState: Partial<ConnectionState> = { connection: "close" };
	let socket: any;

	const destroy = async (logout = true) => {
		try {
			if (logout && socket) {
				// Limpiar caché de sesión al hacer logout completo
				clearSessionCache(sessionId);
				await Promise.allSettled([
					socket.logout(),
					prisma.chat.deleteMany({ where: { sessionId } }),
					prisma.contact.deleteMany({ where: { sessionId } }),
					prisma.message.deleteMany({ where: { sessionId } }),
					prisma.groupMetadata.deleteMany({ where: { sessionId } }),
					prisma.userSession.deleteMany({ where: { sessionId } }),
					prisma.webhook.deleteMany({ where: { sessionId } }),
					prisma.session.deleteMany({ where: { sessionId } }),
				]);
				logger.info("Session and data destroyed (logged out)", { session: sessionId });
			} else {
				// NO limpiar caché - mantener para reconexión
				await prisma.userSession.updateMany({
					where: { sessionId },
					data: { status: "inactive" },
				});
				logger.info("Session marked as inactive (cache preserved for reconnection)", { session: sessionId });
			}
		} catch (e) {
			logger.error("Error during session destroy", e);
		} finally {
			sessionsMap.delete(sessionId);
		}
	};

	// ============================================================
	// 🔄 MANEJO DE CIERRE DE CONEXIÓN
	// ============================================================
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

		if (code === DisconnectReason.loggedOut || doNotReconnect) {
			if (res) {
				if (SSE && !res.writableEnded) {
					try {
						res.write(`data: ${JSON.stringify({
							connection: "close",
							sessionId,
							reason: code === DisconnectReason.loggedOut ? "logged_out" : "max_retries_reached",
							statusCode: code,
						})}\n\n`);
					} catch (e) {
						logger.error("Failed to send SSE close event", { sessionId, error: e });
					}
				}
				if (!SSE && !res.headersSent) {
					res.status(500).json({ error: "Unable to create session" });
				}
				res.end();
			}
			destroy(code === DisconnectReason.loggedOut);
			clearRestartingLock(sessionId); // Asegurar liberar lock
			return;
		}

		// IMPORTANTE: Eliminar de sessionsMap para permitir que la reconexión proceda
		// de lo contrario, createSession bloqueará el intento por "Session already exists"
		sessionsMap.delete(sessionId);

		if (!restartRequired) {
			logger.info("Reconnecting...", { attempts: retries.get(sessionId) ?? 1, sessionId });
		}

		setTimeout(
			() => {
				clearRestartingLock(sessionId); // Liberar JUSTO antes de re-intentar
				createSession({ ...options, sessionId });
			},
			restartRequired ? 0 : RECONNECT_INTERVAL,
		);
	};

	// ============================================================
	// 🔔 HANDLERS PARA EVENTOS SSE O HTTP NORMAL
	// ============================================================
	const handleNormalConnectionUpdate = async () => {
		if (!connectionState.qr?.length) return;

		if (res && !res.writableEnded) {
			try {
				const qr = await toDataURL(connectionState.qr);
				res.status(200).json({ qr, sessionId });
			} catch (e) {
				logger.error("QR generation error", e);
				res.status(500).json({ error: "QR generation failed" });
			}
		}
	};

	const handleSSEConnectionUpdate = async () => {
		let qr: string | undefined;

		if (connectionState.qr?.length) {
			try {
				qr = await toDataURL(connectionState.qr);
			} catch (e) {
				logger.error("QR error", e);
			}
		}

		const current = SSEQRGenerations.get(sessionId) ?? 0;
		if (!res || res.writableEnded || (qr && current >= SSE_MAX_QR_GENERATION)) {
			if (res && !res.writableEnded) {
				if (qr && current >= SSE_MAX_QR_GENERATION) {
					try {
						res.write(`data: ${JSON.stringify({
							connection: "close",
							sessionId,
							reason: "qr_expired",
							maxQrReached: true,
						})}\n\n`);
					} catch (e) {
						logger.error("Failed to send SSE qr_expired event", { sessionId, error: e });
					}
				}
				res.end();
			}
			return;
		}

		const data = { ...connectionState, qr, sessionId };
		if (qr) SSEQRGenerations.set(sessionId, current + 1);

		try {
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		} catch (e) {
			if (res && !res.writableEnded) res.end();
			destroy(false);
		}
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;

	// ============================================================
	// 🔌 CREACIÓN DEL SOCKET Y SUSCRIPCIÓN A EVENTOS
	// ============================================================
	try {
		const { state, saveCreds } = await useSession(sessionId);
		socket = makeWASocket({
			printQRInTerminal: false,
			generateHighQualityLinkPreview: false,
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
		socket.sendRetryRequest = async (...args: any[]) => {
			try {
				await originalSendRetryRequest(...args);
			} catch (error) {
				if (isConnectionClosedError(error)) return;
				throw error;
			}
		};

		socket.ev.on("creds.update", saveCreds);
		socket.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
			connectionState = update;
			const { connection, lastDisconnect } = update;
			const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

			logger.info("connection.update", { sessionId, connection, statusCode, SSE });

			if (connection === "open") {
				retries.delete(sessionId);
				SSEQRGenerations.delete(sessionId);

				// Verificar y subir pre-keys solo si realmente es necesario
				try {
					const preKeyCount = await countPreKeys(sessionId);
					logger.info("Current pre-key count", { sessionId, preKeyCount });

					if (preKeyCount < PRE_KEY_SUFFICIENT_THRESHOLD) {
						await socket.uploadPreKeysToServerIfRequired();
						logger.info("Pre-keys uploaded", { sessionId, previousCount: preKeyCount });
					} else {
						logger.info("Skipping pre-key upload, sufficient keys exist", { sessionId, preKeyCount });
					}
				} catch (e) {
					logger.error("Failed to manage pre-keys", { sessionId, error: e });
				}

				// ============================================================
				// 💾 GUARDAR / ACTUALIZAR SESIÓN EN BD AL CONECTAR
				// ============================================================
				const now = new Date();
				const me = socket.user;
				let phoneNumber: string | null = null;
				let userName: string | null = deviceName;

				if (me?.id) {
					const decoded = jidDecode(me.id);
					phoneNumber = decoded?.user || null;
					userName = me.name || me.notify || deviceName;
				}

				let accountType: AccountType = AccountType.personal;
				if (me?.id) {
					try {
						const businessProfile = await socket.getBusinessProfile(me.id);
						if (businessProfile) {
							accountType = AccountType.business;
							logger.info("Business account detected", { sessionId, category: businessProfile.category });
						}
					} catch (e) {
						logger.debug("Could not fetch business profile, assuming personal account", { sessionId });
					}
				}

				try {
					await prisma.userSession.upsert({
						where: { sessionId },
						update: {
							status: "active",
							lastActive: now,
							updatedAt: now,
							deviceName: userName,
							phoneNumber,
							accountType,
							data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
						},
						create: {
							id: sessionId,
							sessionId,
							userId,
							status: "active",
							deviceName: userName,
							phoneNumber,
							accountType,
							createdAt: now,
							updatedAt: now,
							lastActive: now,
							data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
						},
					});
					logger.info("UserSession synced to database on connection open", { sessionId, phoneNumber, userName });
				} catch (e) {
					logger.error("Failed to sync UserSession on connection open", { sessionId, error: e });
				}

				if (res && !res.writableEnded) {
					if (SSE) {
						try {
							res.write(`data: ${JSON.stringify({ connection: "open", sessionId, phoneNumber, deviceName: userName, accountType })}\n\n`);
						} catch (e) {
							logger.error("Failed to send SSE open event", { sessionId, error: e });
						}
					}
					res.end();
					clearRestartingLock(sessionId); // Carga exitosa, liberamos lock
					return;
				}
				clearRestartingLock(sessionId); // Carga exitosa, liberamos lock
			}

			if (connection === "close") {
				handleConnectionClose();
			}

			handleConnectionUpdate();
		});

		// Sesión inicializada correctamente en memoria
		logger.info("createSession: session initialized in memory", { sessionId });

	} catch (error) {
		logger.error("createSession: Critical error during initialization", { sessionId, error });
		clearRestartingLock(sessionId);
		if (res && !res.headersSent && !SSE) {
			res.status(500).json({ error: "Failed to initialize session", sessionId });
		}
	}
}

