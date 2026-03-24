import type { BaileysEventEmitter, WAMessageKey } from 'baileys';
import { jidNormalizedUser } from 'baileys';
import type { BaileysEventHandler, MakeTransformedPrisma } from '@/store/types';
import { filterPrisma, transformPrisma } from '@/store/utils';
import { prisma } from '@/db';
import { logger } from '@/shared';
import { Prisma, type Message } from '@prisma/client';

const MESSAGE_KEYS = [
	'sessionId',
	'remoteJid',
	'id',
	'key',
	'message',
	'messageTimestamp',
	'status',
	'participant',
	'pushName',
	'reactions',
	'userReceipt',
];


function toBigIntTimestamp(ts: any): bigint | null {
	if (!ts) return null;

	// Baileys Long object
	if (typeof ts === 'object' && typeof ts.low === 'number' && typeof ts.high === 'number') {
		return BigInt(ts.high * 2 ** 32 + ts.low);
	}

	// number or string
	return BigInt(ts);
}

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe ? 'me' : key?.participant || key?.remoteJid) || '';

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	// 🚀 SOTA: Helper reutilizable para evitar procesar mensajes basura/pesados
	const shouldProcess = (jid?: string | null, msg?: any) => {
		if (!jid || jid.endsWith('@status')) return false;
		if (msg?.protocolMessage) return false;
		return true;
	};

	const set: BaileysEventHandler<'messaging-history.set'> = async ({ messages }) => {
		try {
			const filteredMessages = messages.filter((msg) => shouldProcess(msg.key.remoteJid, msg.message));

			await prisma.$transaction(async (tx) => {


				// 🚀 SOTA: Batching createMany to avoid Prisma P2035
				const BATCH_SIZE = 100;
				const data = filteredMessages.map((msg) => {
					const rawData = filterPrisma({
						...msg,
						remoteJid: msg.key.remoteJid!,
						id: msg.key.id!,
						sessionId,
					}, MESSAGE_KEYS);
					
					return transformPrisma(rawData) as any;
				});

				for (let i = 0; i < data.length; i += BATCH_SIZE) {
					await tx.message.createMany({
						data: data.slice(i, i + BATCH_SIZE),
						skipDuplicates: true,
					});
				}
			});
			logger.info({ sessionId, count: filteredMessages.length }, 'Synced message history');
		} catch (e) {
			logger.error(e, 'Error during messages.set');
		}
	};

	let upsertBuffer: any[] = [];
	let flushTimeout: NodeJS.Timeout | null = null;

	const flushUpserts = async () => {
		if (upsertBuffer.length === 0) return;

		const batch = [...upsertBuffer];
		upsertBuffer = [];
		if (flushTimeout) {
			clearTimeout(flushTimeout);
			flushTimeout = null;
		}

		try {
			await prisma.message.createMany({
				data: batch,
				skipDuplicates: true,
			});
			logger.debug({ sessionId, count: batch.length }, '🚀 SOTA: Batch messages persisted to DB');
		} catch (e) {
			logger.error(e, 'Error during batch message persistence');
		}
	};

	const upsert: BaileysEventHandler<'messages.upsert'> = async ({ messages, type }) => {
		if (type !== 'notify' && type !== 'append') return;

		for (const message of messages) {
			try {
				const jid = jidNormalizedUser(message.key.remoteJid!);
				if (!shouldProcess(jid, message.message)) continue;

				const messageTimestamp = toBigIntTimestamp(message.messageTimestamp);

				const rawData = filterPrisma({
					...message,
					remoteJid: jid,
					id: message.key.id!,
					sessionId,
					messageTimestamp,
				}, MESSAGE_KEYS);

				upsertBuffer.push(transformPrisma(rawData));
			} catch (e) {
				logger.error(e, 'Error adding message to upsert buffer');
			}
		}

		// Programar flush cada 5 segundos si hay mensajes
		if (upsertBuffer.length > 0 && !flushTimeout) {
			flushTimeout = setTimeout(flushUpserts, 5000);
		}

		// Si el buffer es muy grande (>100), forzar flush inmediato
		if (upsertBuffer.length >= 100) {
			await flushUpserts();
		}
	};

	const update: BaileysEventHandler<'messages.update'> = async (updates) => {
		for (const { update: msgUpdate, key } of updates) {
			try {
				const jid = key.remoteJid!;
				const id = key.id!;
				if (!shouldProcess(jid)) continue;

				// 🚀 Lógica de Edición y Actualización
				await prisma.$transaction(async (tx) => {
					const prevData = await tx.message.findUnique({
						where: { sessionId_remoteJid_id: { id, remoteJid: jid, sessionId } },
					});

					if (!prevData) return;

					const merged = { ...prevData, ...msgUpdate };
					const filteredUpdateData = filterPrisma(merged, MESSAGE_KEYS);
					const transformed = transformPrisma(filteredUpdateData) as any;

					await tx.message.update({
						where: { pkId: prevData.pkId },
						data: transformed,
					});

				});
			} catch (e) {
				logger.error(e, 'Error during message.update');
			}
		}
	};

	const del: BaileysEventHandler<'messages.delete'> = async (item) => {
		try {
			if ('all' in item) {
				await prisma.message.deleteMany({ where: { remoteJid: item.jid, sessionId } });
				return;
			}
			const jid = item.keys[0].remoteJid!;
			if (!shouldProcess(jid)) return;

			await prisma.message.deleteMany({
				where: { id: { in: item.keys.map((k) => k.id!) }, remoteJid: jid, sessionId },
			});
		} catch (e) {
			logger.error(e, 'Error during message.delete');
		}
	};

	const updateReceipt: BaileysEventHandler<'message-receipt.update'> = async (updates) => {
		for (const { key, receipt } of updates) {
			try {
				if (!shouldProcess(key.remoteJid)) continue;

				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findUnique({
						where: { sessionId_remoteJid_id: { id: key.id!, remoteJid: key.remoteJid!, sessionId } },
						select: { pkId: true, userReceipt: true },
					});
					if (!message) return;

					const userReceipt = (message.userReceipt || []) as any[];
					const existingIdx = userReceipt.findIndex((r) => r.userJid === receipt.userJid);

					if (existingIdx > -1) {
						userReceipt[existingIdx] = { ...userReceipt[existingIdx], ...receipt };
					} else {
						userReceipt.push(receipt);
					}

					const cleanUserReceipt = JSON.parse(JSON.stringify(userReceipt));
					await tx.message.update({
						where: { pkId: message.pkId },
						data: { userReceipt: cleanUserReceipt },
					});
				});
			} catch (e) {
				logger.error(e, 'Error during receipt.update');
			}
		}
	};

	const updateReaction: BaileysEventHandler<'messages.reaction'> = async (reactions) => {
		for (const { key, reaction } of reactions) {
			try {
				if (!shouldProcess(key.remoteJid)) continue;

				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findUnique({
						where: { sessionId_remoteJid_id: { id: key.id!, remoteJid: key.remoteJid!, sessionId } },
						select: { pkId: true, reactions: true },
					});
					if (!message) return;

					const authorID = getKeyAuthor(reaction.key);
					const reactions = ((message.reactions || []) as any[]).filter(
						(r) => getKeyAuthor(r.key) !== authorID,
					);

					if (reaction.text) reactions.push(reaction);

					const cleanReactions = JSON.parse(JSON.stringify(reactions));
					await tx.message.update({
						where: { pkId: message.pkId },
						data: { reactions: cleanReactions },
					});
				});
			} catch (e) {
				logger.error(e, 'Error during reaction.update');
			}
		}
	};

	const listen = () => {
		if (listening) return;

		event.on('messaging-history.set', set);
		event.on('messages.upsert', upsert);
		event.on('messages.update', update);
		event.on('messages.delete', del);
		event.on('message-receipt.update', updateReceipt);
		event.on('messages.reaction', updateReaction);

		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off('messaging-history.set', set);
		event.off('messages.upsert', upsert);
		event.off('messages.update', update);
		event.off('messages.delete', del);
		event.off('message-receipt.update', updateReceipt);
		event.off('messages.reaction', updateReaction);

		listening = false;
	};

	return { listen, unlisten, upsert, update, updateReceipt, updateReaction, set, del };
}
