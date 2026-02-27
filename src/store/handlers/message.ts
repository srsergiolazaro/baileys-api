import type { BaileysEventEmitter, MessageUserReceipt, proto, WAMessageKey } from "baileys";
import { jidNormalizedUser, toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { filterPrisma, transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { Prisma, type Message } from "@prisma/client";

const MESSAGE_KEYS = Object.keys(Prisma.MessageScalarFieldEnum);

function toBigIntTimestamp(ts: any): bigint | null {
	if (!ts) return null;

	// Baileys Long object
	if (typeof ts === "object" && typeof ts.low === "number" && typeof ts.high === "number") {
		return BigInt((ts.high * 2 ** 32) + ts.low);
	}

	// number or string
	return BigInt(ts);
}

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe ? "me" : key?.participant || key?.remoteJid) || "";

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ messages, isLatest }) => {
		try {
			const filteredMessages = messages.filter(msg => {
				const jid = msg.key.remoteJid || "";
				if (jid.endsWith("@status") || msg.message?.protocolMessage) return false;
				return true;
			});

			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.message.deleteMany({ where: { sessionId } });

				await tx.message.createMany({
					data: filteredMessages.map((message) => {
						const transformed = transformPrisma(message) as MakeTransformedPrisma<Message>;
						const data = {
							...transformed,
							remoteJid: message.key.remoteJid!,
							id: message.key.id!,
							sessionId,
						};
						return filterPrisma(data, MESSAGE_KEYS) as any;
					}),
					skipDuplicates: true
				});
			});
			logger.info({ sessionId, count: filteredMessages.length }, "Synced message history");
		} catch (e) {
			logger.error(e, "Error during messages.set");
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
				skipDuplicates: true
			});
			logger.debug({ sessionId, count: batch.length }, "🚀 SOTA: Batch messages persisted to DB");
		} catch (e) {
			logger.error(e, "Error during batch message persistence");
		}
	};

	const upsert: BaileysEventHandler<"messages.upsert"> = async ({ messages, type }) => {
		if (type !== "notify" && type !== "append") return;

		for (const message of messages) {
			try {
				const jid = jidNormalizedUser(message.key.remoteJid!);
				if (jid.endsWith("@status") || message.message?.protocolMessage) continue;

				const data = transformPrisma(message) as MakeTransformedPrisma<Message>;
				const messageTimestamp = toBigIntTimestamp(message.messageTimestamp);

				const prismaData = {
					...data,
					remoteJid: jid,
					id: message.key.id!,
					sessionId,
					messageTimestamp,
					messageStubParameters: [],
					labels: [],
					userReceipt: [],
					reactions: [],
					pollUpdates: [],
					eventResponses: [],
					statusMentionSources: [],
					supportAiCitations: []
				};

				upsertBuffer.push(filterPrisma(prismaData, MESSAGE_KEYS));
			} catch (e) {
				logger.error(e, "Error adding message to upsert buffer");
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

	const update: BaileysEventHandler<"messages.update"> = async (updates) => {
		for (const { update: msgUpdate, key } of updates) {
			try {
				const jid = key.remoteJid!;
				const id = key.id!;

				// 🚀 Lógica de Edición y Actualización
				await prisma.$transaction(async (tx) => {
					const prevData = await tx.message.findUnique({
						where: { sessionId_remoteJid_id: { id, remoteJid: jid, sessionId } }
					});

					if (!prevData) return;

					// Merge de datos (Pattern: Baileys handles the protocol logic, we just merge)
					const merged = { ...prevData, ...msgUpdate };
					const transformed = transformPrisma(merged) as MakeTransformedPrisma<Message>;

					// Remover metadatos internos de Prisma para el update
					const { pkId: _, sessionId: __, ...updateData } = transformed;

					await tx.message.update({
						where: { pkId: prevData.pkId },
						data: updateData
					});
				});
			} catch (e) {
				logger.error(e, "Error during message.update");
			}
		}
	};

	const del: BaileysEventHandler<"messages.delete"> = async (item) => {
		try {
			if ("all" in item) {
				await prisma.message.deleteMany({ where: { remoteJid: item.jid, sessionId } });
				return;
			}
			const jid = item.keys[0].remoteJid!;
			await prisma.message.deleteMany({
				where: { id: { in: item.keys.map(k => k.id!) }, remoteJid: jid, sessionId }
			});
		} catch (e) {
			logger.error(e, "Error during message.delete");
		}
	};

	const updateReceipt: BaileysEventHandler<"message-receipt.update"> = async (updates) => {
		for (const { key, receipt } of updates) {
			try {
				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findFirst({
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
						select: { pkId: true, userReceipt: true }
					});
					if (!message) return;

					let userReceipt = (message.userReceipt || []) as any[];
					const existingIdx = userReceipt.findIndex(r => r.userJid === receipt.userJid);

					if (existingIdx > -1) {
						userReceipt[existingIdx] = { ...userReceipt[existingIdx], ...receipt };
					} else {
						userReceipt.push(receipt);
					}

					const cleanUserReceipt = JSON.parse(JSON.stringify(userReceipt));
					await tx.message.update({
						where: { pkId: message.pkId },
						data: { userReceipt: cleanUserReceipt }
					});
				});
			} catch (e) {
				logger.error(e, "Error during receipt.update");
			}
		}
	};

	const updateReaction: BaileysEventHandler<"messages.reaction"> = async (reactions) => {
		for (const { key, reaction } of reactions) {
			try {
				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findFirst({
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
						select: { pkId: true, reactions: true }
					});
					if (!message) return;

					const authorID = getKeyAuthor(reaction.key);
					let reactions = ((message.reactions || []) as any[]).filter(r => getKeyAuthor(r.key) !== authorID);

					if (reaction.text) reactions.push(reaction);

					const cleanReactions = JSON.parse(JSON.stringify(reactions));
					await tx.message.update({
						where: { pkId: message.pkId },
						data: { reactions: cleanReactions }
					});
				});
			} catch (e) {
				logger.error(e, "Error during reaction.update");
			}
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("messages.upsert", upsert);
		event.on("messages.update", update);
		event.on("messages.delete", del);
		event.on("message-receipt.update", updateReceipt);
		event.on("messages.reaction", updateReaction);

		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("messages.upsert", upsert);
		event.off("messages.update", update);
		event.off("messages.delete", del);
		event.off("message-receipt.update", updateReceipt);
		event.off("messages.reaction", updateReaction);

		listening = false;
	};

	return { listen, unlisten, upsert, update, updateReceipt, updateReaction, set, del };
}
