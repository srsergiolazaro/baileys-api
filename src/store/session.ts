
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "baileys";
import { proto } from "baileys";
import { BufferJSON, initAuthCreds } from "baileys";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const fixId = (id: string) => id.replace(/\//g, "__").replace(/:/g, "-");

// ============================================================
// 🔐 GLOBAL SESSION CACHE SYSTEM
// Mantiene las claves en memoria incluso entre reconexiones
// para evitar pérdida de estado y reducir queries a DB
// ============================================================

interface SessionCache {
	keys: Map<string, any>;
	creds: AuthenticationCreds | null;
	dirty: Set<string>; // Keys that need to be persisted
	lastFlush: number;
}

// Caché global por sessionId - sobrevive reconexiones
const globalSessionCache = new Map<string, SessionCache>();

// Configuración de persistencia
const FLUSH_INTERVAL_MS = 60000; // Flush cada 60 segundos si hay cambios
const CRITICAL_KEY_PREFIXES = ["pre-key-", "sender-key-", "session-"]; // Keys importantes para persistir

// Timers de flush por sesión
const flushTimers = new Map<string, NodeJS.Timeout>();

/**
 * Obtiene o crea la caché para una sesión
 */
function getSessionCache(sessionId: string): SessionCache {
	if (!globalSessionCache.has(sessionId)) {
		globalSessionCache.set(sessionId, {
			keys: new Map(),
			creds: null,
			dirty: new Set(),
			lastFlush: Date.now(),
		});
	}
	return globalSessionCache.get(sessionId)!;
}

/**
 * Limpia la caché de una sesión (usar al hacer logout)
 */
export function clearSessionCache(sessionId: string): void {
	const timer = flushTimers.get(sessionId);
	if (timer) {
		clearInterval(timer);
		flushTimers.delete(sessionId);
	}
	globalSessionCache.delete(sessionId);
	logger.info({ sessionId }, "Session cache cleared");
}

/**
 * Persiste las keys sucias a la base de datos en batch
 * Solo se ejecuta cuando hay cambios pendientes
 */
async function flushDirtyKeys(sessionId: string): Promise<void> {
	const cache = globalSessionCache.get(sessionId);
	if (!cache || cache.dirty.size === 0) return;

	const dirtyKeys = Array.from(cache.dirty);
	cache.dirty.clear();
	cache.lastFlush = Date.now();

	// Filtrar solo keys críticas para persistir
	const keysToPersist = dirtyKeys.filter((key) =>
		CRITICAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
	);

	if (keysToPersist.length === 0) {
		logger.debug({ sessionId, skipped: dirtyKeys.length }, "No critical keys to persist");
		return;
	}

	logger.info({ sessionId, count: keysToPersist.length }, "Flushing dirty keys to DB");

	const operations: Promise<any>[] = [];
	const BATCH_SIZE = 50; // Limit batch size to prevent DB overload

	for (let i = 0; i < keysToPersist.length; i += BATCH_SIZE) {
		const batch = keysToPersist.slice(i, i + BATCH_SIZE);
		const batchOps = batch.map((cacheKey) => {
			const value = cache.keys.get(cacheKey);
			const sId = fixId(cacheKey);

			if (value) {
				const serializedData = JSON.stringify(value, BufferJSON.replacer);
				return prisma.session.upsert({
					select: { pkId: true },
					create: { data: serializedData, id: sId, sessionId },
					update: { data: serializedData },
					where: { sessionId_id: { id: sId, sessionId } },
				});
			} else {
				return prisma.session.deleteMany({
					where: { id: sId, sessionId },
				});
			}
		});

		operations.push(
			prisma.$transaction(batchOps).catch((e) => {
				logger.error({ sessionId, batch: i, error: e }, "Batch flush failed");
				// Re-add to dirty set for retry
				batch.forEach((key) => cache.dirty.add(key));
			})
		);

		// Small delay between batches to prevent DB overload
		if (i + BATCH_SIZE < keysToPersist.length) {
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	await Promise.allSettled(operations);
	logger.info({ sessionId, persisted: keysToPersist.length }, "Dirty keys flushed");
}

/**
 * Inicia el timer de flush periódico para una sesión
 */
function startFlushTimer(sessionId: string): void {
	if (flushTimers.has(sessionId)) return;

	const timer = setInterval(async () => {
		try {
			await flushDirtyKeys(sessionId);
		} catch (e) {
			logger.error({ sessionId, error: e }, "Periodic flush failed");
		}
	}, FLUSH_INTERVAL_MS);

	flushTimers.set(sessionId, timer);
	logger.debug({ sessionId }, "Flush timer started");
}

/**
 * Fuerza un flush inmediato de todas las sesiones
 * Útil para shutdown graceful
 */
export async function flushAllSessions(): Promise<void> {
	logger.info("Flushing all session caches...");
	const promises = Array.from(globalSessionCache.keys()).map((sessionId) =>
		flushDirtyKeys(sessionId).catch((e) =>
			logger.error({ sessionId, error: e }, "Failed to flush session on shutdown")
		)
	);
	await Promise.allSettled(promises);
	logger.info("All session caches flushed");
}

export async function useSession(sessionId: string): Promise<{
	state: AuthenticationState;
	saveCreds: (update?: Partial<AuthenticationCreds>) => Promise<void>;
}> {
	const model = prisma.session;
	const cache = getSessionCache(sessionId);

	// Iniciar timer de flush si no existe
	startFlushTimer(sessionId);

	const write = async (data: any, id: string) => {
		try {
			data = JSON.stringify(data, BufferJSON.replacer);
			id = fixId(id);
			await model.upsert({
				select: { pkId: true },
				create: { data, id, sessionId },
				update: { data },
				where: { sessionId_id: { id, sessionId } },
			});
		} catch (e) {
			logger.error(e, "An error occured during session write");
		}
	};

	const read = async (id: string) => {
		try {
			const result = await model.findUnique({
				select: { data: true },
				where: { sessionId_id: { id: fixId(id), sessionId } },
			});

			if (!result) {
				return null;
			}

			return JSON.parse(result.data, BufferJSON.reviver);
		} catch (e) {
			if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
				// Silent - key doesn't exist
			} else {
				logger.error(e, "An error occured during session read");
			}
			return null;
		}
	};

	// Cargar credenciales: primero de caché, luego de DB
	let creds: AuthenticationCreds;
	if (cache.creds) {
		logger.debug({ sessionId }, "Using cached credentials");
		creds = cache.creds;
	} else {
		creds = (await read("creds")) || initAuthCreds();
		cache.creds = creds;
		logger.debug({ sessionId, fromDb: !!cache.creds }, "Credentials loaded");
	}

	const saveCreds = async (update?: Partial<AuthenticationCreds>) => {
		if (update) {
			Object.assign(creds, update);
		}
		cache.creds = creds;
		// PRISMA SE DESPIERTA AQUÍ - Solo en creds.update
		await write(creds, "creds");
		logger.debug({ sessionId }, "Credentials saved to DB");
	};

	return {
		state: {
			creds,
			keys: {
				get: async <T extends keyof SignalDataTypeMap>(
					type: T,
					ids: string[],
				): Promise<{
					[id: string]: SignalDataTypeMap[T];
				}> => {
					const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};

					for (const id of ids) {
						const cacheKey = `${type}-${id}`;

						// 1. Check memory cache first (fastest)
						if (cache.keys.has(cacheKey)) {
							data[id] = cache.keys.get(cacheKey);
							continue;
						}

						// 2. Read from DB (only if not in cache)
						try {
							let value = await read(cacheKey);
							if (type === "app-state-sync-key" && value) {
								value = proto.Message.AppStateSyncKeyData.fromObject(value);
							}

							if (value !== null) {
								cache.keys.set(cacheKey, value);
							}
							data[id] = value;
						} catch (e) {
							logger.error({ sessionId, cacheKey, error: e }, "Error reading key");
							data[id] = null as any;
						}
					}

					return data;
				},
				set: async (data: any): Promise<void> => {
					// Actualizar caché en memoria y marcar como dirty
					for (const category in data) {
						for (const id in data[category]) {
							const cacheKey = `${category}-${id}`;
							const value = data[category][id];

							if (value) {
								cache.keys.set(cacheKey, value);
							} else {
								cache.keys.delete(cacheKey);
							}

							// Marcar como dirty para persistencia posterior
							cache.dirty.add(cacheKey);
						}
					}

					// Si hay muchas keys dirty, flush inmediato para evitar pérdida
					if (cache.dirty.size > 500) {
						logger.warn({ sessionId, dirtyCount: cache.dirty.size }, "Too many dirty keys, forcing flush");
						flushDirtyKeys(sessionId).catch((e) =>
							logger.error({ sessionId, error: e }, "Forced flush failed")
						);
					}
				},
			},
		},
		saveCreds,
	};
}
