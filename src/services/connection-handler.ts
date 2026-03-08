import { DisconnectReason, jidDecode } from 'baileys';
import type { ConnectionState, SocketConfig } from 'baileys';
import { Boom } from '@hapi/boom';
import type { Response } from 'express';
import { toDataURL } from 'qrcode';
import { prisma, withPrismaRetry } from '../db';
import { AccountType } from '@prisma/client';
import { logger } from '../shared';
import { sessionsMap, setRestartingLock, clearRestartingLock } from './session';
import { TelemetryEngine } from './telemetry';

// Intervalo base de reconexión (mínimo 2 segundos para evitar loops rápidos)
const RECONNECT_INTERVAL_BASE = Math.max(Number(process.env.RECONNECT_INTERVAL || 2000), 2000);
const MAX_RECONNECT_RETRIES = Number(process.env.MAX_RECONNECT_RETRIES || 5);
const SSE_MAX_QR_GENERATION = Number(process.env.SSE_MAX_QR_GENERATION || 20);

// Compartir estado de reintentos y SSE
export const retries = new Map<string, number>();
export const SSEQRGenerations = new Map<string, number>();

/**
 * Calculate exponential backoff delay for reconnection
 * Starts at RECONNECT_INTERVAL_BASE and doubles with each attempt, capped at 30 seconds
 * Adds a small random jitter (10-20%) to avoid "thundering herd" effect
 */
export function getReconnectDelay(sessionId: string): number {
	const lastAttempts = retries.get(sessionId) ?? 0;
	// Exponential backoff: base * 2^(attempts-1)
	const baseDelay = Math.min(RECONNECT_INTERVAL_BASE * Math.pow(2, lastAttempts), 30000);
	// Add jitter: 10-20% of the base delay
	const jitter = baseDelay * (0.1 + Math.random() * 0.1);
	return Math.floor(baseDelay + jitter);
}

export function shouldReconnect(sessionId: string) {
	let attempts = retries.get(sessionId) ?? 0;

	if (attempts < MAX_RECONNECT_RETRIES) {
		attempts += 1;
		retries.set(sessionId, attempts);
		return true;
	}
	return false;
}

export function isConnectionClosedError(error: unknown): error is Boom {
	if (!error || typeof error !== 'object') return false;
	const boomError = error as Boom;
	return (
		Boolean((boomError as Boom)?.isBoom) &&
		boomError.output?.statusCode === DisconnectReason.connectionClosed
	);
}

// Pre-key management: prevent excessive generation
// Signal protocol typically needs ~100 pre-keys, having 300+ means we don't need more
export const PRE_KEY_SUFFICIENT_THRESHOLD = 300;

/**
 * Count existing pre-keys for a session
 */
export async function countPreKeys(sessionId: string): Promise<number> {
	const result = await prisma.session.count({
		where: {
			sessionId,
			id: { startsWith: 'pre-key-' },
		},
	});
	return result;
}

/**
 * Realiza limpieza de pre-keys antiguas para evitar que la tabla Session crezca infinitamente.
 * Estrategia recomendada por el creador de Baileys:
 * Borrar llaves < firstUnuploadedPreKeyId, manteniendo un buffer de seguridad.
 */
export async function performSessionCleanup(sessionId: string, socket: any) {
	try {
		const creds = socket.authState.creds;
		const cutoff = creds.firstUnuploadedPreKeyId || 0;
		const BUFFER = 50; // Mantener las últimas 50 llaves subidas para evitar fallos de descifrado

		if (cutoff > BUFFER) {
			const maxToDelete = cutoff - BUFFER;
			const keysToDelete = Array.from({ length: maxToDelete }, (_, i) => (i + 1).toString());

			logger.info({ sessionId, count: keysToDelete.length }, 'Starting pre-key cleanup');

			// Establecemos las llaves a null para que el store las borre de la DB
			await socket.authState.keys.set({
				'pre-key': Object.fromEntries(keysToDelete.map((id) => [id, null])),
			});

			logger.info({ sessionId, count: keysToDelete.length }, 'Pre-key cleanup completed');
		}
	} catch (e) {
		logger.error('Failed to perform session cleanup', { sessionId, error: e });
	}
}

export function createConnectionHandlers(
	sessionId: string,
	options: any,
	connectionStateWrapper: { current: Partial<ConnectionState> },
	res: Response | undefined,
	SSE: boolean,
	createSessionGetter: () => Function,
	destroySession: (logout: boolean) => Promise<void>,
	watchdogTimerWrapper: { current: NodeJS.Timeout | null },
	connectionDeadlineWrapper: { current: NodeJS.Timeout | null }
) {
	const handleConnectionClose = () => {
		const connectionState = connectionStateWrapper.current;
		const lastErr = connectionState.lastDisconnect?.error as Boom | undefined;
		const code = lastErr?.output?.statusCode;
		const restartRequired = code === DisconnectReason.restartRequired;
		const doNotReconnect = !shouldReconnect(sessionId);

		logger.info('connection.close', {
			sessionId,
			code,
			restartRequired,
			doNotReconnect,
			attempts: retries.get(sessionId) ?? 1,
			message: (lastErr as any)?.message,
		});

		if (code === DisconnectReason.loggedOut || doNotReconnect) {
			const reason =
				code === DisconnectReason.loggedOut
					? 'logged_out'
					: `max_retries_reached (${MAX_RECONNECT_RETRIES} attempts)`;
			logger.warn(`🛑 Session stopped reconnecting: ${reason}`, {
				sessionId,
				code,
				attempts: retries.get(sessionId) ?? 0,
			});

			if (res) {
				const session = sessionsMap.get(sessionId);
				const currentRes = session?.sseResponse || res;

				if (SSE && currentRes && !currentRes.writableEnded) {
					try {
						currentRes.write(
							`data: ${JSON.stringify({
								connection: 'close',
								sessionId,
								reason: code === DisconnectReason.loggedOut ? 'logged_out' : 'max_retries_reached',
								statusCode: code,
							})}\n\n`,
						);
						currentRes.end();
					} catch (e) {
						logger.error('Failed to send SSE close event', { sessionId, error: e });
					}
				}
				if (!SSE && !res.headersSent) {
					res.status(500).json({ error: 'Unable to create session' });
					res.end();
				}
			}
			destroySession(code === DisconnectReason.loggedOut);
			clearRestartingLock(sessionId); // Asegurar liberar lock
			return;
		}

		// Bloquear reinicializaciones manuales mientras se espera la reconexión automática
		setRestartingLock(sessionId);

		// IMPORTANTE: Eliminar de sessionsMap para permitir que la reconexión proceda
		sessionsMap.delete(sessionId);

		// 🛡️ Limpiar timers obsoletos antes de la reconexión para evitar leaks de cierres silenciosos cruzados
		if (watchdogTimerWrapper.current) {
			clearTimeout(watchdogTimerWrapper.current);
		}
		if (connectionDeadlineWrapper.current) {
			clearTimeout(connectionDeadlineWrapper.current);
		}

		// Calcular delay con exponential backoff (siempre hay delay mínimo para evitar loops)
		const reconnectDelay = restartRequired ? RECONNECT_INTERVAL_BASE : getReconnectDelay(sessionId);
		logger.info(`Reconnecting in ${reconnectDelay}ms...`, {
			attempts: retries.get(sessionId) ?? 1,
			sessionId,
			restartRequired,
		});

		setTimeout(() => {
			const createSession = createSessionGetter();
			createSession({ ...options, sessionId, isReconnecting: true });
		}, reconnectDelay);
	};

	const handleNormalConnectionUpdate = async () => {
		const connectionState = connectionStateWrapper.current;
		if (!connectionState.qr?.length) return;

		if (res && !res.writableEnded) {
			try {
				const qr = await toDataURL(connectionState.qr);
				res.status(200).json({ qr, sessionId });
			} catch (e) {
				logger.error('QR generation error', e);
				res.status(500).json({ error: 'QR generation failed' });
			}
		}
	};

	const handleSSEConnectionUpdate = async () => {
		const connectionState = connectionStateWrapper.current;
		let qr: string | undefined;

		if (connectionState.qr?.length) {
			try {
				qr = await toDataURL(connectionState.qr);
			} catch (e) {
				logger.error('QR error', e);
			}
		}

		// Update database status if we have a QR
		if (qr) {
			try {
				await withPrismaRetry(async () => {
					await prisma.userSession.update({
						where: { sessionId },
						data: { status: 'authenticating', updatedAt: new Date() },
					});
				}, 2, 500, 'update status to authenticating on QR');
			} catch (e) {
				logger.error({ sessionId, err: e }, 'Failed to update status to authenticating on QR after retries');
			}
		}

		const current = SSEQRGenerations.get(sessionId) ?? 0;
		const session = sessionsMap.get(sessionId);
		const currentRes = session?.sseResponse || res;

		if (!currentRes || currentRes.writableEnded || (qr && current >= SSE_MAX_QR_GENERATION)) {
			if (currentRes && !currentRes.writableEnded) {
				if (qr && current >= SSE_MAX_QR_GENERATION) {
					try {
						currentRes.write(
							`data: ${JSON.stringify({
								connection: 'close',
								sessionId,
								reason: 'qr_expired',
								maxQrReached: true,
							})}\n\n`,
						);
					} catch (e) {
						logger.error('Failed to send SSE qr_expired event', { sessionId, error: e });
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
		} catch {
			if (currentRes && !currentRes.writableEnded) currentRes.end();
			// No destruimos, permitimos reconexión SSE
		}
	};

	const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;

	return { handleConnectionClose, handleConnectionUpdate };
}

/**
 * Gestiona la carga de pre-keys al servidor si es necesario.
 */
export async function managePreKeys(sessionId: string, socket: any) {
	try {
		const preKeyCount = await countPreKeys(sessionId);
		logger.info({ sessionId, preKeyCount }, 'Current pre-key count');

		if (preKeyCount < PRE_KEY_SUFFICIENT_THRESHOLD) {
			await socket.uploadPreKeysToServerIfRequired();
			logger.info({ sessionId, previousCount: preKeyCount }, 'Pre-keys uploaded');
		} else {
			logger.info(
				{ sessionId, preKeyCount },
				'Skipping pre-key upload, sufficient keys exist',
			);
		}
	} catch (e) {
		logger.error({ sessionId, err: e }, 'Failed to manage pre-keys');
	}
}
