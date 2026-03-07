import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from 'baileys';
import { proto } from 'baileys';
import { BufferJSON, initAuthCreds } from 'baileys';
import { prisma } from '@/db';
import { logger } from '@/shared';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const fixId = (id: string) => id.replace(/\//g, '__').replace(/:/g, '-');

export async function useSession(sessionId: string): Promise<{
	state: AuthenticationState;
	saveCreds: (update?: Partial<AuthenticationCreds>) => Promise<void>;
}> {
	const model = prisma.session;

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
			logger.error(e, 'An error occured during session write');
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
			await model.deleteMany({
				where: { id: fixId(id), sessionId },
			});
		} catch (e) {
			logger.error(e, 'An error occured during session delete');
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

					for (const id of ids) {
						const cacheKey = `${type}-${id}`;
						try {
							let value = await read(cacheKey);
							if (type === 'app-state-sync-key' && value) {
								value = proto.Message.AppStateSyncKeyData.fromObject(value);
							}

							data[id] = value !== null ? value : (undefined as any);
						} catch (e) {
							logger.error({ sessionId, cacheKey, error: e }, 'Error reading key from DB');
							data[id] = undefined as any;
						}
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

					await Promise.all(tasks);
				},
			},
		},
		saveCreds,
	};
}
