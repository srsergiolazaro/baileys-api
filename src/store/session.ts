import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from 'baileys';
import { proto } from 'baileys';
import { BufferJSON, initAuthCreds } from 'baileys';
import { prisma, withPrismaRetry } from '@/db';
import { logger } from '@/shared';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const fixId = (id: string) => id.replace(/\//g, '__').replace(/:/g, '-');

export async function useSession(sessionId: string): Promise<{
	state: AuthenticationState;
	saveCreds: (update?: Partial<AuthenticationCreds>) => Promise<void>;
}> {
	const model = prisma.session;

	const write = async (data: any, id: string) => {
		return withPrismaRetry(
			async () => {
				const encodedData = JSON.stringify(data, BufferJSON.replacer);
				const fixedId = fixId(id);
				await model.upsert({
					select: { pkId: true },
					create: { data: encodedData, id: fixedId, sessionId },
					update: { data: encodedData },
					where: { sessionId_id: { id: fixedId, sessionId } },
				});
			},
			3,
			500,
			`session write (${id})`,
		);
	};

	const read = async (id: string) => {
		try {
			return await withPrismaRetry(
				async () => {
					const result = await model.findUnique({
						select: { data: true },
						where: { sessionId_id: { id: fixId(id), sessionId } },
					});

					if (!result) return null;
					try {
						return JSON.parse(result.data, BufferJSON.reviver);
					} catch (parseError) {
						logger.error({ sessionId, id, data: result.data, error: parseError }, '❌ JSON Parse Error in session read');
						return null;
					}
				},
				3,
				500,
				`session read (${id})`,
			);
		} catch (e) {
			if (e instanceof PrismaClientKnownRequestError && e.code === 'P2025') {
				// Silent - key doesn't exist
			} else {
				logger.error(e, 'An error occured during session read');
			}
			return null;
		}
	};

	const del = async (id: string) => {
		try {
			await withPrismaRetry(
				async () => {
					await model.deleteMany({
						where: { id: fixId(id), sessionId },
					});
				},
				3,
				500,
				`session delete (${id})`,
			);
		} catch (e) {
			logger.error(e, 'An error occured during session delete');
			throw e;
		}
	};

	// Cargar credenciales directamente de DB
	const creds: AuthenticationCreds = (await read('creds')) || initAuthCreds();
	logger.debug({ sessionId, exists: !!creds.registrationId }, 'Credentials loaded from DB');

	const saveCreds = async (update?: Partial<AuthenticationCreds>) => {
		if (update) {
			Object.assign(creds, update);
		}
		await write(creds, 'creds');
		logger.debug({ sessionId }, 'Credentials saved directly to DB');
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
					const fixedIds = ids.map((id) => fixId(`${type}-${id}`));

					try {
						// 🚀 SOTA: Batching queries to avoid Prisma P2035 (too many bind variables)
						const CHUNK_SIZE = 5000;
						const results: { id: string; data: string }[] = [];

						for (let i = 0; i < fixedIds.length; i += CHUNK_SIZE) {
							const chunk = fixedIds.slice(i, i + CHUNK_SIZE);
							const chunkResults = await withPrismaRetry(
								async () => {
									return await model.findMany({
										where: {
											sessionId,
											id: { in: chunk },
										},
										select: { id: true, data: true },
									});
								},
								3,
								500,
								`session bulk read chunk (${type})`,
							);
							results.push(...chunkResults);
						}

						// Mapear resultados de vuelta a los IDs originales de Baileys
						for (const id of ids) {
							const fId = fixId(`${type}-${id}`);
							const result = results.find((r) => r.id === fId);

							if (result) {
								let value: any;
								try {
									value = JSON.parse(result.data, BufferJSON.reviver);
								} catch (parseError) {
									logger.error({ sessionId, type, id, data: result.data, error: parseError }, '❌ JSON Parse Error in session bulk read');
									data[id] = undefined as any;
									continue;
								}
								if (type === 'app-state-sync-key' && value) {
									value = proto.Message.AppStateSyncKeyData.fromObject(value);
								}
								data[id] = value;
							} else {
								data[id] = undefined as any;
							}
						}
					} catch (e) {
						logger.error({ sessionId, type, ids, error: e }, 'Error in bulk reading keys from DB');
						for (const id of ids) data[id] = undefined as any;
					}

					return data;
				},
				set: async (data: any): Promise<void> => {
					const tasks: Promise<void>[] = [];

					for (const category in data) {
						for (const id in data[category]) {
							const cacheKey = `${category}-${id}`;
							const value = data[category][id];

							if (value) {
								tasks.push(write(value, cacheKey));
							} else {
								tasks.push(del(cacheKey));
							}
						}
					}

					// Ejecutar en paralelo con retries individuales (vía write/del)
					// 🚀 SOTA: Throwing error if any task fails to prevent Baileys state de-sync
					await Promise.all(tasks);
				},
			},
		},
		saveCreds,
	};
}
