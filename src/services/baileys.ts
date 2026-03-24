import { v4 as uuidv4 } from 'uuid';

import makeWASocket, {
	DisconnectReason,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	addTransactionCapability,
	jidDecode,
	fetchLatestBaileysVersion,
} from 'baileys';
import type {
	ConnectionState,
	SocketConfig,
	WAMessageContent,
} from 'baileys';
import { Store, useSession } from '../store';
import { prisma, withPrismaRetry } from '../db';
import { AccountType } from '@prisma/client';
import { logger } from '../shared';
import { Boom } from '@hapi/boom';
import type { Response } from 'express';
import { sessionsMap, setRestartingLock, clearRestartingLock, sessionExists } from './session';
import { TelemetryEngine } from './telemetry';

import { handleMessagesUpsert } from './handlers';
import { setupAntiBanQueue } from './anti-ban';
import { setupDbSyncHandlers, syncUserSessionToDb } from './db-sync';
import {
	createConnectionHandlers,
	retries,
	SSEQRGenerations,
	PRE_KEY_SUFFICIENT_THRESHOLD,
	countPreKeys,
	performSessionCleanup,
	managePreKeys
} from './connection-handler';

import { globalMessageCache } from '../store/message-cache';

// Map para rastrear motores de telemetría por sesión
const telemetryEngines = new Map<string, TelemetryEngine>();

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
		deviceName = 'WhatsApp User',
		isReconnecting = false,
	} = options;

	// ============================================================
	// 🛡️ PREVENCIÓN DE SESIONES DUPLICADAS
	// ============================================================
	if (sessionExists(sessionId)) {
		logger.info('createSession: Session already exists, attaching/skipping', { sessionId });
		if (SSE && res) {
			const session = sessionsMap.get(sessionId);
			if (session) {
				session.sseResponse = res;
				session.SSE = true;
				// Enviar mensaje de reconexión exitosa al canal
				try {
					res.write(`data: ${JSON.stringify({ sessionId, status: 'attached' })}\n\n`);
				} catch (e) {
					logger.error('Failed to write to new SSE response', { sessionId, error: e });
				}
				return { success: true, sessionId, attached: true };
			}
		}
		if (res && !res.headersSent && !SSE) {
			return res.status(409).json({ error: 'Session already exists', sessionId });
		}
		return { error: 'Session already exists', sessionId };
	}

	if (!isReconnecting && !setRestartingLock(sessionId)) {
		logger.warn('createSession: Session is already initializing, skipping', { sessionId });
		if (res && !res.headersSent && !SSE) {
			return res.status(429).json({ error: 'Session is already initializing', sessionId });
		}
		return { error: 'Session is already initializing', sessionId };
	}

	// ============================================================
	// 🔐 VALIDACIÓN SSE — SOLO EN MODO SSE
	// ============================================================
	if (SSE) {
		try {
			if (!res || res.writableEnded) {
				logger.error('SSE habilitado pero no hay response válido', { sessionId });
				clearRestartingLock(sessionId);
				return { error: 'SSE channel unavailable', sessionId: null };
			}

			// Primer mensaje SSE obligatorio (solo si no es reconexión)
			if (!isReconnecting) {
				res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
				logger.info('SSE inicial enviado correctamente', { sessionId });
			}
		} catch (e) {
			logger.error('❌ Error inicial SSE. NO se creará la sesión.', {
				sessionId,
				error: (e as any)?.message,
			});

			if (res && !res.writableEnded) res.end();
			clearRestartingLock(sessionId);
			return { error: 'SSE initialization failed', sessionId: null };
		}
	}

	logger.info(
		{ sessionId, userId, SSE, readIncomingMessages, hasSocketConfig: !!socketConfig },
		'createSession: start',
	);

	// ============================================================
	//  REGISTRO INICIAL EN BASE DE DATOS
	// Asegura que la sesión aparezca en el dashboard mientras se escanea el QR
	// ============================================================
	try {
		await withPrismaRetry(async () => {
			const now = new Date();
			await prisma.userSession.upsert({
				where: { sessionId },
				update: {
					updatedAt: now,
					lastActive: now,
				},
				create: {
					id: sessionId,
					sessionId,
					userId,
					status: 'authenticating',
					deviceName: deviceName,
					createdAt: now,
					updatedAt: now,
					lastActive: now,
				},
			});
		}, 3, 1000, 'initial UserSession upsert');
	} catch (e) {
		logger.error({ sessionId, err: e }, 'Failed to create initial UserSession after retries. Aborting session creation.');
		clearRestartingLock(sessionId);
		if (res && !res.headersSent && !SSE) {
			res.status(503).json({ error: 'Database unavailable, please try again later', sessionId });
		}
		return { error: 'Database unavailable', sessionId };
	}

	// ============================================================
	// 🛡️ DECLARACIÓN DE ESTADO Y TIMERS (Wrappers)
	// ============================================================
	const connectionStateWrapper: { current: Partial<ConnectionState> } = {
		current: { connection: 'close' },
	};
	let socket: ReturnType<typeof makeWASocket>;
	const connectionDeadlineWrapper: { current: NodeJS.Timeout | null } = { current: null };

	// ============================================================
	// 🔥 DESTRUCCIÓN COMPLETA DE SESIÓN
	// ============================================================
	const destroy = async (logout = true) => {
		try {
			if (logout && socket) {
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
				logger.info({ sessionId }, 'Session and data destroyed (logged out)');
			} else {
				// NO limpiar caché - mantener para reconexión
				await prisma.userSession.updateMany({
					where: { sessionId },
					data: { status: 'inactive' },
				});
				logger.info({ sessionId }, 'Session marked as inactive (cache preserved for reconnection)');
			}
		} catch (e) {
			logger.error({ sessionId, err: e }, 'Error during session destroy');
		} finally {
			if (connectionDeadlineWrapper.current) {
				clearTimeout(connectionDeadlineWrapper.current);
				connectionDeadlineWrapper.current = null;
			}

			const engine = telemetryEngines.get(sessionId);
			if (engine) {
				engine.stop();
				telemetryEngines.delete(sessionId);
			}

			if (socket) {
				logger.info({ sessionId }, 'Cleaning up socket listeners for GC');
				socket.ev.removeAllListeners('connection.update');
				socket.ws.close();
			}
			sessionsMap.delete(sessionId);
			retries.delete(sessionId);
			SSEQRGenerations.delete(sessionId);
		}
	};

	// Cargar Service Handlers de conexión
	const { handleConnectionClose, handleConnectionUpdate } = createConnectionHandlers(
		sessionId,
		options,
		connectionStateWrapper,
		res,
		SSE,
		() => createSession,
		destroy,
		connectionDeadlineWrapper,
	);

	// ============================================================
	// 🔌 CREACIÓN DEL SOCKET Y SUSCRIPCIÓN A EVENTOS
	// ============================================================
	try {
		const { state, saveCreds } = await useSession(sessionId);

		// 🚀 OPTIMIZACIÓN 100X: Transactional Signal Store
		const signalStore = addTransactionCapability(state.keys, logger, {
			maxCommitRetries: 3,
			delayBetweenTriesMs: 500,
		});

		// 🚀 OBTENER VERSIÓN OFICIAL (DINÁMICA)
		const { version, isLatest } = await fetchLatestBaileysVersion();
		logger.info(
			{ sessionId, version: version.join('.'), isLatest },
			'Socket using latest WA version',
		);

		socket = makeWASocket({
			version,
			printQRInTerminal: false,
			generateHighQualityLinkPreview: false,
			syncFullHistory: false,
			connectTimeoutMs: 10_000,
			keepAliveIntervalMs: 30_000,
			shouldSyncHistoryMessage: () => false,
			markOnlineOnConnect: false,
			...socketConfig,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(signalStore, logger),
			},
			logger,
			shouldIgnoreJid: (jid) => isJidBroadcast(jid),

			getMessage: async (key): Promise<WAMessageContent | undefined> => {
				try {
					if (!key?.id || !key?.remoteJid) return undefined;
					
					// 🚀 SOTA: Búsqueda rapidísima en memoria segregada
					const memMsg = globalMessageCache.get(sessionId, key.remoteJid, key.id);
					if (memMsg) return memMsg;

					const msg = await prisma.message.findUnique({
						where: {
							sessionId_remoteJid_id: {
								id: key.id,
								remoteJid: key.remoteJid,
								sessionId,
							},
						},
						select: { message: true },
					});
					
					if (msg?.message) {
						globalMessageCache.set(sessionId, key.remoteJid, key.id, msg.message as WAMessageContent);
						return msg.message as WAMessageContent;
					}
					return undefined;
				} catch {
					return undefined;
				}
			},
		});

		const store = new Store(sessionId, socket.ev);
		sessionsMap.set(sessionId, { ...socket, destroy, store, sseResponse: res, SSE });

		// Modulo: Anti-Ban Queue Limiters
		setupAntiBanQueue(socket, sessionId, telemetryEngines);

		const originalSendRetryRequest = socket.sendRetryRequest.bind(socket);
		socket.sendRetryRequest = async (msg: any) => {
			try {
				await originalSendRetryRequest(msg);
			} catch (error) {
				const boomError = error as Boom;
				if (
					Boolean((boomError as Boom)?.isBoom) &&
					boomError.output?.statusCode === DisconnectReason.connectionClosed
				) return;
				throw error;
			}
		};

		// 🛡️ DEADLINE DE CONEXIÓN GLOBAL
		connectionDeadlineWrapper.current = setTimeout(() => {
			const currentSession = sessionsMap.get(sessionId);
			if (currentSession && connectionStateWrapper.current.connection !== 'open') {
				logger.error({ sessionId }, '🔥 Connection Deadline Exceeded: Killing silent hang');
				destroy(false);
			}
		}, 60000);

		socket.ev.on('creds.update', async () => {
			try {
				await saveCreds();
				logger.debug({ sessionId }, 'Creds persisted successfully');
			} catch (err) {
				logger.error({ sessionId, error: err }, 'Failed to persist creds');
			}
		});

		// Iniciar watchdog y escuchar CUALQUIER evento

		// Modulo: BD Identity & Contact Sync
		setupDbSyncHandlers(socket, sessionId);

		socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
			connectionStateWrapper.current = { ...connectionStateWrapper.current, ...update };
			const { connection, lastDisconnect } = update;
			const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
			const attemptCount = retries.get(sessionId) ?? 0;

			if (connection === 'open') {
				if (connectionDeadlineWrapper.current) {
					clearTimeout(connectionDeadlineWrapper.current);
					connectionDeadlineWrapper.current = null;
				}
				logger.info({ sessionId }, 'connection.update: open');

				if (!telemetryEngines.has(sessionId)) {
					const engine = new TelemetryEngine(sessionId, socket);
					engine.start();
					telemetryEngines.set(sessionId, engine);
				}
			} else if (connection === 'close') {
				// El manejo detallado se hace en handleConnectionClose
			} else if (update.qr) {
				logger.debug({ sessionId }, 'connection.update: qr received');
				try {
					await prisma.userSession.update({
						where: { sessionId },
						data: { status: 'authenticating', updatedAt: new Date() },
					});
				} catch (e) {
					logger.error({ sessionId, err: e }, 'Failed to update status to authenticating on QR');
				}
			} else if (lastDisconnect?.error) {
				if (attemptCount > 2) {
					logger.warn({ sessionId, statusCode, attempts: attemptCount }, 'connection.update: connection errored');
				} else {
					logger.debug({ sessionId, statusCode }, 'connection.update: transient connection error');
				}
			}

			if (connection === 'open') {
				retries.delete(sessionId);
				SSEQRGenerations.delete(sessionId);

				await managePreKeys(sessionId, socket);

				try {
					const result = await syncUserSessionToDb(
						sessionId,
						socket,
						userId,
						deviceName,
						socketConfig,
						readIncomingMessages
					);

					performSessionCleanup(sessionId, socket);

					const session = sessionsMap.get(sessionId);
					const currentRes = session?.sseResponse || res;

					if (currentRes && !currentRes.writableEnded) {
						if (SSE) {
							currentRes.write(
								`data: ${JSON.stringify({
									connection: 'open',
									sessionId,
									phoneNumber: result.phoneNumber,
									deviceName: result.deviceName,
									accountType: result.accountType,
									isBusiness: result.isBusiness
								})}\n\n`,
							);
							currentRes.end();
						} else {
							currentRes.end();
						}
					}
				} catch (e) {
					logger.error({ sessionId, err: e }, 'Failed to sync UserSession on connection open');
				} finally {
					clearRestartingLock(sessionId);
				}
				return;
			}

			if (connection === 'close') {
				handleConnectionClose();
			}

			handleConnectionUpdate().catch((err) => {
				logger.error({ sessionId, err }, 'Failed to handle connection update');
			});
		});

		socket.ev.on('messages.upsert', async (m: { messages: any[]; type: 'notify' | 'append' }) => {
			try {
				await handleMessagesUpsert(socket, m, sessionId, readIncomingMessages);
			} catch (err) {
				logger.error({ sessionId, err }, 'Critical error processing incoming messages');
			}
		});

		logger.info('createSession: session initialized in memory', { sessionId });
	} catch (error) {
		logger.error({ sessionId, err: error }, 'createSession: Critical error during initialization');
		clearRestartingLock(sessionId);

		try {
			await prisma.userSession.update({
				where: { sessionId },
				data: { status: 'inactive' },
			});
		} catch (dbErr) {
			logger.error('Failed to mark session as inactive after critical error', {
				sessionId,
				error: dbErr,
			});
		}

		if (res && !res.headersSent && !SSE) {
			res.status(500).json({ error: 'Failed to initialize session', sessionId });
		}
	}
}
