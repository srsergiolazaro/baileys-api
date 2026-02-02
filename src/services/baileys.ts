import { v4 as uuidv4 } from "uuid";

import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	jidDecode,
} from "baileys";
import type { ConnectionState, GroupParticipant, ParticipantAction, SocketConfig } from "baileys";
import { Store, useSession } from "../store";
import { prisma } from "../db";
import { AccountType } from "@prisma/client";
import { logger } from "../shared";
import type { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { sessionsMap } from "./session";
// DESHABILITADO: Handlers de webhooks desactivados para reducir queries a DB
// import { handleMessagesUpsert, handleGroupParticipantsUpdate } from "./handlers";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 0);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 5);

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
	// 🔐 VALIDACIÓN SSE — SOLO EN MODO SSE
	// Solo seguimos si el canal SSE funciona correctamente.
	// Si falla, no creamos sesión en BD ni inicializamos socket.
	// ============================================================
	if (SSE) {
		try {
			if (!res || res.writableEnded) {
				logger.error("SSE habilitado pero no hay response válido", { sessionId });
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
	// 🗄️ ACTUALIZACIÓN DE SESIÓN EXISTENTE EN BD
	// ============================================================
	const now = new Date();
	try {
		const session = await prisma.userSession.findFirst({
			where: { sessionId },
		});

		if (session) {
			await prisma.userSession.update({
				where: { id: session.id },
				data: {
					status: "active",
					lastActive: now,
					updatedAt: now,
				},
			});
			logger.info("createSession: existing userSession marked as active", { sessionId });
		}
	} catch (error) {
		logger.error("Error updating existing session status", { sessionId, error });
	}

	// ============================================================
	// 🔥 DESTRUCCIÓN COMPLETA DE SESIÓN
	// ============================================================
	let connectionState: Partial<ConnectionState> = { connection: "close" };

	const destroy = async (logout = true) => {
		try {
			if (logout) {
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
				await prisma.userSession.update({
					where: { sessionId },
					data: { status: "inactive" },
				});
				logger.info("Session marked as inactive (not logged out)", { session: sessionId });
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
				if (!SSE && !res.headersSent) {
					res.status(500).json({ error: "Unable to create session" });
				}
				res.end();
			}
			destroy(code === DisconnectReason.loggedOut);
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
			if (res && !res.writableEnded) res.end();
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
	});

	const store = new Store(sessionId, socket.ev);
	sessionsMap.set(sessionId, { ...socket, destroy, store });

	socket.sendRetryRequest = async (...args) => {
		try {
			await socket.sendRetryRequest(...args);
		} catch (error) {
			if (isConnectionClosedError(error)) return;
			throw error;
		}
	};

	socket.ev.on("creds.update", saveCreds);
	socket.ev.on("connection.update", async (update) => {
		connectionState = update;
		const { connection, lastDisconnect } = update;
		const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

		logger.info("connection.update", { sessionId, connection, statusCode, SSE });

		if (connection === "open") {
			retries.delete(sessionId);
			SSEQRGenerations.delete(sessionId);

			// Verificar y subir pre-keys si es necesario
			try {
				await socket.uploadPreKeysToServerIfRequired();
				logger.info("Pre-keys verified/uploaded successfully", { sessionId });
			} catch (e) {
				logger.error("Failed to verify/upload pre-keys", { sessionId, error: e });
			}

			// ============================================================
			// 💾 GUARDAR / ACTUALIZAR SESIÓN EN BD AL CONECTAR
			// ============================================================
			const now = new Date();

			// Obtener número de teléfono y nombre del usuario conectado
			const me = socket.user;
			let phoneNumber: string | null = null;
			let userName: string | null = deviceName;

			if (me?.id) {
				const decoded = jidDecode(me.id);
				phoneNumber = decoded?.user || null;
				userName = me.name || me.notify || deviceName;
			}

			// Detectar tipo de cuenta (personal o business)
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
				res.end();
				return;
			}
		}

		if (connection === "close") {
			if (statusCode === DisconnectReason.loggedOut) {
				destroy(true);
				return;
			}

			handleConnectionClose();
		}

		handleConnectionUpdate();
	});

	// DESHABILITADO: Estos handlers causan queries constantes a la DB
	// Si necesitas webhooks, descomenta estas líneas
	// socket.ev.on("messages.upsert", (m) =>
	// 	handleMessagesUpsert(socket, m, sessionId, readIncomingMessages),
	// );

	// socket.ev.on("group-participants.update", (c: any) =>
	// 	handleGroupParticipantsUpdate(socket, c, sessionId),
	// );

	// Sesión inicializada correctamente en memoria
	logger.info("createSession: session initialized in memory", { sessionId });
}

