import type { BaileysEventEmitter, MessageUserReceipt, proto, WAMessageKey } from "baileys";
import { jidNormalizedUser, toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import type { Message } from "@prisma/client";

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
			// Filtrar mensajes innecesarios antes de guardar historia
			const filteredMessages = messages.filter(msg => {
				const jid = msg.key.remoteJid || "";
				// 1. Ignorar estados (historias)
				if (jid.endsWith("@status")) return false;
				// 2. Ignorar mensajes de protocolo (configuraciones internas)
				if (msg.message?.protocolMessage) return false;
				return true;
			});

			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.message.deleteMany({ where: { sessionId } });

				await tx.message.createMany({
					data: filteredMessages.map((message) => ({
						...(transformPrisma(message) as MakeTransformedPrisma<Message>),
						remoteJid: message.key.remoteJid!,
						id: message.key.id!,
						sessionId,
					})),
				});
			});
			logger.info({ messages: filteredMessages.length, skipped: messages.length - filteredMessages.length }, "Synced filtered messages history");
		} catch (e) {
			logger.error(e, "An error occured during messages set");
		}
	};

	const upsert: BaileysEventHandler<"messages.upsert"> = async ({ messages, type }) => {
		switch (type) {
			case "append":
			case "notify":
				const verifiedChats = new Set<string>();

				for (const message of messages) {
					try {
						const jid = jidNormalizedUser(message.key.remoteJid!);

						// --- FILTROS DE ELIMINACIÓN ---
						if (jid.endsWith("@status") || message.message?.protocolMessage) continue;

						const { statusMentions, messageAddOns, ...restOfMessage } = message;
						const messageData = { ...restOfMessage };
						const data = transformPrisma(messageData) as MakeTransformedPrisma<Message>;
						const ts = message.messageTimestamp;
						const messageTimestampBigInt = toBigIntTimestamp(ts);

						const prismaData = {
							...data,
							remoteJid: jid,
							id: message.key.id!,
							sessionId,
							messageTimestamp: messageTimestampBigInt,
							messageStubParameters: [],
							labels: [],
							userReceipt: [],
							reactions: [],
							pollUpdates: [],
							eventResponses: [],
							statusMentionSources: [],
							supportAiCitations: []
						};

						await prisma.message.upsert({
							select: { pkId: true },
							create: prismaData,
							update: prismaData,
							where: {
								sessionId_remoteJid_id: {
									remoteJid: jid,
									id: message.key.id!,
									sessionId
								}
							},
						});

						if (type === "notify" && !verifiedChats.has(jid)) {
							const chatExists = (await prisma.chat.count({ where: { id: jid, sessionId } })) > 0;
							if (!chatExists) {
								event.emit("chats.upsert", [
									{
										id: jid,
										conversationTimestamp: toNumber(message.messageTimestamp),
										unreadCount: 1,
									},
								]);
							}
							verifiedChats.add(jid);
						}
					} catch (e) {
						logger.error(e, "An error occured during message processing");
					}
				}
				break;
		}
	};

	const update: BaileysEventHandler<"messages.update"> = async (updates) => {
		for (const { update, key } of updates) {
			try {
				await prisma.$transaction(async (tx) => {
					const updateAny = update as any;
					const incomingId =
						typeof key?.id === "string"
							? key.id
							: typeof updateAny?.key?.id === "string"
								? updateAny.key.id
								: typeof updateAny?.message?.key?.id === "string"
									? updateAny.message.key.id
									: undefined;
					const incomingRemoteJid =
						typeof key?.remoteJid === "string"
							? key.remoteJid
							: typeof updateAny?.key?.remoteJid === "string"
								? updateAny.key.remoteJid
								: typeof updateAny?.message?.key?.remoteJid === "string"
									? updateAny.message.key.remoteJid
									: undefined;

					if (!incomingId || !incomingRemoteJid) return;

					const prevData = await tx.message.findUnique({
						where: {
							sessionId_remoteJid_id: {
								id: incomingId,
								remoteJid: incomingRemoteJid,
								sessionId,
							},
						},
					});
					if (!prevData) return;

					const data = { ...prevData, ...update } as any;
					const transformed = transformPrisma(data) as MakeTransformedPrisma<Message>;
					const {
						pkId: _pkId,
						sessionId: _sessionId,
						remoteJid: _remoteJid,
						id: _id,
						...prismaData
					} = transformed;

					await tx.message.update({
						select: { pkId: true },
						data: {
							...prismaData,
							id: incomingId,
							remoteJid: incomingRemoteJid,
							sessionId,
						},
						where: { pkId: prevData.pkId },
					});
				});
			} catch (e) {
				logger.error(e, "An error occured during message update");
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
				where: { id: { in: item.keys.map((k) => k.id!) }, remoteJid: jid, sessionId },
			});
		} catch (e) {
			logger.error(e, "An error occured during message delete");
		}
	};

	const updateReceipt: BaileysEventHandler<"message-receipt.update"> = async (updates) => {
		for (const { key, receipt } of updates) {
			try {
				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findFirst({
						select: { pkId: true, userReceipt: true },
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
					});
					if (!message) return;

					let userReceipt = (message.userReceipt || []) as any[];
					const recepient = userReceipt.find((m) => m.userJid === receipt.userJid);

					if (recepient) {
						userReceipt = [...userReceipt.filter((m) => m.userJid !== receipt.userJid), receipt];
					} else {
						userReceipt.push(receipt);
					}

					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ userReceipt: userReceipt }),
						where: { pkId: message.pkId },
					});
				});
			} catch (e) {
				logger.error(e, "An error occured during message receipt update");
			}
		}
	};

	const updateReaction: BaileysEventHandler<"messages.reaction"> = async (reactions) => {
		for (const { key, reaction } of reactions) {
			try {
				await prisma.$transaction(async (tx) => {
					const message = await tx.message.findFirst({
						select: { pkId: true, reactions: true },
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
					});
					if (!message) return;

					const authorID = getKeyAuthor(reaction.key);
					const currentReactions = ((message.reactions || []) as any[]).filter(
						(r) => getKeyAuthor(r.key) !== authorID,
					);

					if (reaction.text) currentReactions.push(reaction);
					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ reactions: currentReactions }),
						where: { pkId: message.pkId },
					});
				});
			} catch (e) {
				logger.error(e, "An error occured during message reaction update");
			}
		}
	};

	const listen = () => {
		if (listening) return;

		// event.on("messaging-history.set", set);
		// event.on("messages.upsert", upsert);
		// event.on("messages.update", update);
		// event.on("messages.delete", del);
		// event.on("message-receipt.update", updateReceipt);
		// event.on("messages.reaction", updateReaction);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		// event.off("messaging-history.set", set);
		// event.off("messages.upsert", upsert);
		// event.off("messages.update", update);
		// event.off("messages.delete", del);
		// event.off("message-receipt.update", updateReceipt);
		// event.off("messages.reaction", updateReaction);
		listening = false;
	};

	return { listen, unlisten };
}
