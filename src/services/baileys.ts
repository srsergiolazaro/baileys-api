import { v4 as uuidv4 } from "uuid";

import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	addTransactionCapability,
	jidDecode,
	fetchLatestBaileysVersion
} from "baileys";
import type { ConnectionState, GroupParticipant, ParticipantAction, SocketConfig, WAMessageContent } from "baileys";
import { Store, useSession, clearSessionCache } from "../store";
import { prisma } from "../db";
import { AccountType } from "@prisma/client";
import { logger } from "../shared";
import { Boom } from "@hapi/boom";
import type { Response } from "express";
import { toDataURL } from "qrcode";
import { sessionsMap, setRestartingLock, clearRestartingLock, sessionExists } from "./session";
import { TelemetryEngine } from "./telemetry";

// Map para rastrear motores de telemetría por sesión
const telemetryEngines = new Map<string, TelemetryEngine>();
// DESHABILITADO: Handlers de webhooks desactivados para reducir queries a DB
// import { handleMessagesUpsert, handleGroupParticipantsUpdate } from "./handlers";

const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

// Intervalo base de reconexión (mínimo 2 segundos para evitar loops rápidos)
const RECONNECT_INTERVAL_BASE = Math.max(Number(process.env.RECONNECT_INTERVAL || 2000), 2000);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 20);

/**
 * Calculate exponential backoff delay for reconnection
 * Starts at RECONNECT_INTERVAL_BASE and doubles with each attempt, capped at 30 seconds
 * Adds a small random jitter (10-20%) to avoid "thundering herd" effect
 */
function getReconnectDelay(sessionId: string): number {
	const lastAttempts = retries.get(sessionId) ?? 0;
	// Exponential backoff: base * 2^(attempts-1)
	const baseDelay = Math.min(RECONNECT_INTERVAL_BASE * Math.pow(2, lastAttempts), 30000);
	// Add jitter: 10-20% of the base delay
	const jitter = baseDelay * (0.1 + Math.random() * 0.1);
	return Math.floor(baseDelay + jitter);
}

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
	isReconnecting?: boolean;
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
		isReconnecting = false,
	} = options;

	// ============================================================
	// 🛡️ PREVENCIÓN DE SESIONES DUPLICADAS
	// ============================================================
	if (sessionExists(sessionId)) {
		logger.info("createSession: Session already exists, attaching/skipping", { sessionId });
		if (SSE && res) {
			const session = sessionsMap.get(sessionId);
			if (session) {
				session.sseResponse = res;
				session.SSE = true;
				// Enviar mensaje de reconexión exitosa al canal
				try {
					res.write(`data: ${JSON.stringify({ sessionId, status: "attached" })}\n\n`);
				} catch (e) {
					logger.error("Failed to write to new SSE response", { sessionId, error: e });
				}
				return { success: true, sessionId, attached: true };
			}
		}
		if (res && !res.headersSent && !SSE) {
			return res.status(409).json({ error: "Session already exists", sessionId });
		}
		return { error: "Session already exists", sessionId };
	}

	if (!isReconnecting && !setRestartingLock(sessionId)) {
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

			// Primer mensaje SSE obligatorio (solo si no es reconexión)
			if (!isReconnecting) {
				res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
				logger.info("SSE inicial enviado correctamente", { sessionId });
			}

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
	// � REGISTRO INICIAL EN BASE DE DATOS
	// Asegura que la sesión aparezca en el dashboard mientras se escanea el QR
	// ============================================================
	try {
		const now = new Date();
		await prisma.userSession.upsert({
			where: { sessionId },
			update: {
				status: "authenticating", // Estado temporal mientras se escanea
				updatedAt: now,
				lastActive: now,
			},
			create: {
				id: sessionId,
				sessionId,
				userId,
				status: "authenticating",
				deviceName: deviceName,
				createdAt: now,
				updatedAt: now,
				lastActive: now,
			},
		});
	} catch (e) {
		logger.error("Failed to create initial UserSession", { sessionId, error: e });
	}

	// ============================================================
	// �🔥 DESTRUCCIÓN COMPLETA DE SESIÓN
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
			if (watchdogTimer) {
				clearTimeout(watchdogTimer);
				watchdogTimer = null;
			}

			const engine = telemetryEngines.get(sessionId);
			if (engine) {
				engine.stop();
				telemetryEngines.delete(sessionId);
			}

			if (socket) {
				logger.info({ sessionId }, "Cleaning up socket listeners for GC");
				socket.ev.removeAllListeners();
				socket.ws.close();
			}
			sessionsMap.delete(sessionId);
			retries.delete(sessionId);
			SSEQRGenerations.delete(sessionId);
		}
	};

	// ============================================================
	// 🐕 WATCHDOG - REINICIO DE SESIÓN ZOMBIE
	// Recomendación del creador: Reiniciar si no hay eventos en 5 min.
	// ============================================================
	const WATCHDOG_TIMEOUT = 5 * 60 * 1000; // 5 minutos
	let watchdogTimer: NodeJS.Timeout | null = null;

	const resetWatchdog = () => {
		if (watchdogTimer) clearTimeout(watchdogTimer);
		watchdogTimer = setTimeout(async () => {
			if (!sessionsMap.has(sessionId)) return; // Sesión ya destruida

			logger.warn({ sessionId }, "🐕 Watchdog: Sesión zombie detectada (5 min sin eventos). Reiniciando...");
			if (socket) {
				try {
					socket.end(new Boom("Watchdog: No events for 5 minutes", { statusCode: DisconnectReason.connectionLost }));
				} catch (e) {
					logger.error({ sessionId, error: e }, "Failed to end socket via watchdog");
				}
			}
		}, WATCHDOG_TIMEOUT);
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
			const reason = code === DisconnectReason.loggedOut
				? "logged_out"
				: `max_retries_reached (${MAX_RECONNECT_RETRIES} attempts)`;
			logger.warn(`🛑 Session stopped reconnecting: ${reason}`, {
				sessionId,
				code,
				attempts: retries.get(sessionId) ?? 0
			});

			if (res) {
				const session = sessionsMap.get(sessionId);
				const currentRes = session?.sseResponse || res;

				if (SSE && currentRes && !currentRes.writableEnded) {
					try {
						currentRes.write(`data: ${JSON.stringify({
							connection: "close",
							sessionId,
							reason: code === DisconnectReason.loggedOut ? "logged_out" : "max_retries_reached",
							statusCode: code,
						})}\n\n`);
						currentRes.end();
					} catch (e) {
						logger.error("Failed to send SSE close event", { sessionId, error: e });
					}
				}
				if (!SSE && !res.headersSent) {
					res.status(500).json({ error: "Unable to create session" });
					res.end();
				}
			}
			destroy(code === DisconnectReason.loggedOut);
			clearRestartingLock(sessionId); // Asegurar liberar lock
			return;
		}

		// Bloquear reinicializaciones manuales mientras se espera la reconexión automática
		setRestartingLock(sessionId);

		// IMPORTANTE: Eliminar de sessionsMap para permitir que la reconexión proceda
		sessionsMap.delete(sessionId);

		// Calcular delay con exponential backoff (siempre hay delay mínimo para evitar loops)
		const reconnectDelay = restartRequired ? RECONNECT_INTERVAL_BASE : getReconnectDelay(sessionId);
		logger.info(`Reconnecting in ${reconnectDelay}ms...`, {
			attempts: retries.get(sessionId) ?? 1,
			sessionId,
			restartRequired
		});

		setTimeout(
			() => {
				// NO liberamos el lock manualmente aquí, createSession lo hará cuando termine o falle
				// Solo nos aseguramos de que createSession sepa que es una reconexión legítima
				createSession({ ...options, sessionId, isReconnecting: true });
			},
			reconnectDelay,
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
		const session = sessionsMap.get(sessionId);
		const currentRes = session?.sseResponse || res;

		if (!currentRes || currentRes.writableEnded || (qr && current >= SSE_MAX_QR_GENERATION)) {
			if (currentRes && !currentRes.writableEnded) {
				if (qr && current >= SSE_MAX_QR_GENERATION) {
					try {
						currentRes.write(`data: ${JSON.stringify({
							connection: "close",
							sessionId,
							reason: "qr_expired",
							maxQrReached: true,
						})}\n\n`);
					} catch (e) {
						logger.error("Failed to send SSE qr_expired event", { sessionId, error: e });
					}
				}
				currentRes.end();
			}
			return;
		}

		const data = { ...connectionState, qr, sessionId };
		if (qr) SSEQRGenerations.set(sessionId, current + 1);

		try {
			currentRes.write(`data: ${JSON.stringify(data)}\n\n`);
		} catch (e) {
			if (currentRes && !currentRes.writableEnded) currentRes.end();
			// No destruimos, permitimos reconexión SSE
		}
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;

	// ============================================================
	// 🔌 CREACIÓN DEL SOCKET Y SUSCRIPCIÓN A EVENTOS
	// ============================================================
	try {
		const { state, saveCreds } = await useSession(sessionId);


		// ============================================================
		// 🚀 OPTIMIZACIÓN 100X: Transactional Signal Store
		// Previene condiciones de carrera y errores de "Old Counter".
		// ============================================================
		const signalStore = addTransactionCapability(state.keys, logger, {
			maxCommitRetries: 3,
			delayBetweenTriesMs: 500
		});

		// 🚀 OBTENER VERSIÓN OFICIAL (DINÁMICA)
		// Evita el mensaje "The sender may be on an old version of Whatsapp"
		const { version, isLatest } = await fetchLatestBaileysVersion();
		logger.info({ sessionId, version: version.join('.'), isLatest }, "Socket using latest WA version");

		socket = makeWASocket({
			version,
			printQRInTerminal: false,
			generateHighQualityLinkPreview: false,
			syncFullHistory: false,
			// ============================================================
			// 🚀 OPTIMIZACIÓN 100X: Skip History Sync
			// No descargar chats pasados. Ahorra 100x en red, CPU y RAM.
			// ============================================================
			shouldSyncHistoryMessage: () => false,
			markOnlineOnConnect: false, // No marcar como online automáticamente al conectar
			...socketConfig,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(signalStore, logger),
			},
			logger,
			shouldIgnoreJid: (jid) => isJidBroadcast(jid),
			// ============================================================
			// 🚀 OPTIMIZACIÓN: Cargar mensajes desde la BD para Reacciones/Retries
			// ============================================================
			getMessage: async (key): Promise<WAMessageContent | undefined> => {
				try {
					const msg = await prisma.message.findFirst({
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
						select: { message: true }
					});
					return (msg?.message as any) || undefined;
				} catch {
					return undefined;
				}
			}
		});

		const store = new Store(sessionId, socket.ev);
		sessionsMap.set(sessionId, { ...socket, destroy, store, sseResponse: res, SSE });

		// ============================================================
		// 🚦 ANTI-BAN THROTTLING (Cola de mensajes)
		// Recomendación del creador: Baileys no tiene throttling nativo.
		// Implementamos un retraso humano de 1-3 segundos entre mensajes.
		// ============================================================
		const messageQueue: { jid: string; content: any; options: any; resolve: any; reject: any }[] = [];
		let isProcessingQueue = false;

		const originalSendMessage = socket.sendMessage.bind(socket);

		const processQueue = async () => {
			if (isProcessingQueue || messageQueue.length === 0) return;
			isProcessingQueue = true;

			while (messageQueue.length > 0) {
				const { jid, content, options, resolve, reject } = messageQueue.shift()!;
				try {
					// ============================================================
					// 🎭 HUMAN STEALTH SIMULATION (Composing...)
					// ============================================================
					// 1. Notificar al motor de telemetría la actividad (Despertar modo FOREGROUND)
					const telEngine = telemetryEngines.get(sessionId);
					if (telEngine) await telEngine.activityUpdate();

					// 2. Marcar como "disponible" (si no lo está ya)
					// (activityUpdate ya lo pone disponible si estaba en background)
					await socket.sendPresenceUpdate("available");

					// 2. Marcar como "escribiendo" (composing) por un tiempo aleatorio
					await socket.sendPresenceUpdate("composing", jid);
					const typingDelay = Math.floor(Math.random() * (2000 - 500 + 1)) + 500; // 0.5s a 2s
					await new Promise(res => setTimeout(res, typingDelay));

					// 3. Dejar de escribir antes de enviar
					await socket.sendPresenceUpdate("paused", jid);

					// Usamos setImmediate para asegurar que el envío no bloquee el event loop
					await new Promise(res => setImmediate(res));
					const result = await originalSendMessage(jid, content, options);
					resolve(result);
				} catch (err) {
					reject(err);
				}
				// Retraso aleatorio "humano" entre 1.5 y 3 segundos
				const delay = Math.floor(Math.random() * (3000 - 1500 + 1)) + 1500;
				await new Promise(res => setTimeout(res, delay));
			}

			isProcessingQueue = false;
		};

		socket.sendMessage = (jid: string, content: any, options: any) => {
			return new Promise((resolve, reject) => {
				messageQueue.push({ jid, content, options, resolve, reject });
				processQueue();
			});
		};

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

		// Iniciar watchdog y escuchar CUALQUIER evento
		resetWatchdog();
		socket.ev.process(() => {
			resetWatchdog();
		});

		// ============================================================
		// 🆔 EVENTOS DE IDENTIDAD (LID & Contacts)
		// Según recomendación: Vincular PN con LID para evitar duplicados.
		// ============================================================
		socket.ev.on("lid-mapping.update", async (mapping: { pn: string; lid: string }) => {
			const { pn, lid } = mapping;
			logger.info({ pn, lid, sessionId }, "LID mapping received, syncing identity in DB");
			try {
				await prisma.$transaction(async (tx) => {
					// 1. Actualizar la sesión del usuario si el PN o LID coincide con la sesión actual
					const currentMe = socket.user;
					if (currentMe?.id) {
						const decoded = jidDecode(currentMe.id);
						const userPart = decoded?.user;
						if (userPart && (pn.includes(userPart) || lid.includes(userPart))) {
							await tx.userSession.update({
								where: { sessionId },
								data: {
									phoneNumber: pn,
									// Podríamos añadir un campo 'lid' a UserSession si fuera necesario en el futuro
									updatedAt: new Date()
								}
							});
						}
					}

					// 2. Vincular Contactos: Si existe un contacto con este PN, añadirle el LID (y viceversa)
					// Esto evita duplicados al buscar por cualquiera de los dos IDs
					await tx.contact.updateMany({
						where: {
							sessionId,
							OR: [
								{ id: pn },
								{ id: lid },
								{ phoneNumber: pn },
								{ lid: lid }
							]
						},
						data: { phoneNumber: pn, lid: lid }
					});

					// 3. Vincular Chats: Lo mismo para la tabla de chats
					await tx.chat.updateMany({
						where: {
							sessionId,
							OR: [
								{ id: pn },
								{ id: lid },
								{ pnJid: pn },
								{ lidJid: lid }
							]
						},
						data: { pnJid: pn, lidJid: lid }
					});
				});
			} catch (e) {
				logger.error("Failed to sync identity mapping", { sessionId, error: e });
			}
		});

		socket.ev.on("contacts.upsert", async (contacts: any[]) => {
			try {
				const validContacts = contacts.filter(c => c.id);
				if (validContacts.length === 0) return;

				logger.info({ sessionId, count: validContacts.length }, "Bulk syncing contacts");

				await prisma.$transaction(
					validContacts.map(contact =>
						prisma.contact.upsert({
							where: { sessionId_id: { sessionId, id: contact.id } },
							update: {
								name: contact.name || contact.notify || contact.verifiedName,
								phoneNumber: contact.phoneNumber,
								lid: contact.lid
							},
							create: {
								sessionId,
								id: contact.id,
								name: contact.name || contact.notify || contact.verifiedName,
								phoneNumber: contact.phoneNumber,
								lid: contact.lid
							}
						})
					)
				);
			} catch (e) {
				logger.error("Failed to bulk sync contacts", { sessionId, error: e });
			}
		});

		socket.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
			connectionState = { ...connectionState, ...update };
			const { connection, lastDisconnect } = update;
			const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
			const attemptCount = retries.get(sessionId) ?? 0;

			// Solo logueamos como INFO si la conexión está abierta o el estado es importante
			// Si es un error y estamos en los primeros reintentos, lo bajamos a DEBUG para reducir ruido
			if (connection === "open") {
				logger.info("connection.update: open", { sessionId, statusCode });

				// ============================================================
				// 🚀 SOTA: Iniciar Motor de Telemetría al conectar
				// ============================================================
				if (!telemetryEngines.has(sessionId)) {
					const engine = new TelemetryEngine(sessionId, socket);
					engine.start();
					telemetryEngines.set(sessionId, engine);
				}
			} else if (connection === "close") {
				// El manejo detallado se hace en handleConnectionClose
			} else if (update.qr) {
				logger.debug("connection.update: qr received", { sessionId });
			} else if (lastDisconnect?.error) {
				// Solo alertamos si ya llevamos un par de intentos fallidos
				if (attemptCount > 2) {
					logger.warn("connection.update: connection errored", { sessionId, statusCode, attempts: attemptCount });
				} else {
					logger.debug("connection.update: transient connection error", { sessionId, statusCode });
				}
			}

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
				let isBusiness = false;

				if (me?.id) {
					// 1. Obtener AccountType de las credenciales (si Baileys lo detectó en el payload inicial)
					// 0 = Personal, 1 = Business (según especificación de WA)
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const creds = (socket.authState.creds as any);
					const credsAccountType = creds.account?.accountType;

					try {
						// 2. Consultar perfil de negocio (confirmación definitiva)
						const profile = await socket.getBusinessProfile(me.id);

						// Una cuenta business real tendrá categoría o descripción asignada
						if (profile && (profile.category || profile.description || profile.address)) {
							isBusiness = true;
							accountType = AccountType.business;
							logger.info("Business account confirmed via profile content", { sessionId, category: profile.category });
						} else if (credsAccountType !== undefined) {
							// 3. Fallback al AccountType si el perfil falló o no tiene datos
							isBusiness = credsAccountType === 1; // 1 es Business
							if (isBusiness) accountType = AccountType.business;
							logger.info("Business status confirmed via creds accountType", { sessionId, isBusiness, credsAccountType });
						}
					} catch (e) {
						// 4. Si falla la consulta IQ, confiamos únicamente en el AccountType de las credenciales
						if (credsAccountType !== undefined) {
							isBusiness = credsAccountType === 1;
							if (isBusiness) accountType = AccountType.business;
							logger.debug("Profile query failed, using creds accountType", { sessionId, isBusiness, credsAccountType });
						} else {
							// Sin indicadores claros, por defecto es personal para evitar falsos positivos
							isBusiness = false;
							accountType = AccountType.personal;
							logger.debug("Business detection inconclusive, defaulting to personal", { sessionId });
						}
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
							isBusiness,
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
							isBusiness,
							createdAt: now,
							updatedAt: now,
							lastActive: now,
							data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
						},
					});
					logger.info("UserSession synced to database on connection open", { sessionId, phoneNumber, userName });

					// ============================================================
					// 🧹 LIMPIEZA DE LLAVES (Cleanup)
					// Según recomendación del creador para evitar bloat en DB
					// ============================================================
					performSessionCleanup(sessionId, socket);

				} catch (e) {
					logger.error("Failed to sync UserSession on connection open", { sessionId, error: e });
				}

				const session = sessionsMap.get(sessionId);
				const currentRes = session?.sseResponse || res;

				if (currentRes && !currentRes.writableEnded) {
					if (SSE) {
						try {
							currentRes.write(`data: ${JSON.stringify({ connection: "open", sessionId, phoneNumber, deviceName: userName, accountType, isBusiness })}\n\n`);
							currentRes.end();
						} catch (e) {
							logger.error("Failed to send SSE open event", { sessionId, error: e });
						}
					} else {
						currentRes.end();
					}
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

/**
 * Realiza limpieza de pre-keys antiguas para evitar que la tabla Session crezca infinitamente.
 * Estrategia recomendada por el creador de Baileys:
 * Borrar llaves < firstUnuploadedPreKeyId, manteniendo un buffer de seguridad.
 */
async function performSessionCleanup(sessionId: string, socket: any) {
	try {
		const creds = socket.authState.creds;
		const cutoff = creds.firstUnuploadedPreKeyId || 0;
		const BUFFER = 50; // Mantener las últimas 50 llaves subidas para evitar fallos de descifrado

		if (cutoff > BUFFER) {
			const maxToDelete = cutoff - BUFFER;
			const keysToDelete = Array.from({ length: maxToDelete }, (_, i) => (i + 1).toString());

			logger.info({ sessionId, count: keysToDelete.length }, "Starting pre-key cleanup");

			// Establecemos las llaves a null para que el store las borre de la DB
			await socket.authState.keys.set({
				"pre-key": Object.fromEntries(keysToDelete.map((id) => [id, null])),
			});

			logger.info({ sessionId, count: keysToDelete.length }, "Pre-key cleanup completed");
		}
	} catch (e) {
		logger.error("Failed to perform session cleanup", { sessionId, error: e });
	}
}

