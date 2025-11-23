import type { BaileysEventEmitter, MessageUserReceipt, proto, WAMessageKey } from "baileys";
import { jidNormalizedUser, toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import type { Message } from "@prisma/client";

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe ? "me" : key?.participant || key?.remoteJid) || "";

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ messages, isLatest }) => {
		try {
			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.message.deleteMany({ where: { sessionId } });

				await tx.message.createMany({
					data: messages.map((message) => ({
						...(transformPrisma(message) as MakeTransformedPrisma<Message>),
						remoteJid: message.key.remoteJid!,
						id: message.key.id!,
						sessionId,
					})),
				});
			});
			logger.info({ messages: messages.length }, "Synced messages");
		} catch (e) {
			logger.error(e, "An error occured during messages set");
		}
	};

	const upsert: BaileysEventHandler<"messages.upsert"> = async ({ messages, type }) => {
		switch (type) {
			case "append":
			case "notify":
				for (const message of messages) {
					try {
						const jid = jidNormalizedUser(message.key.remoteJid!);
						// Remove unsupported fields
						const { statusMentions, messageAddOns, ...restOfMessage } = message;
						const messageData = { ...restOfMessage };

						// Transform the message data for Prisma
						const data = transformPrisma(messageData) as MakeTransformedPrisma<Message>;

						const ts = message.messageTimestamp;
						const messageTimestampBigInt =
							ts && typeof ts === "object" && "toString" in ts
								? BigInt(ts.toString())
								: ts ? BigInt(ts) : null;

						// Only include fields that exist in the Prisma schema
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

						try {
							await prisma.message.upsert({
								select: { pkId: true },
								create: prismaData,
								update: data,
								where: {
									sessionId_remoteJid_id: {
										remoteJid: jid,
										id: message.key.id!,
										sessionId
									}
								},
							});
						} catch (error) {
							// Log the full error for debugging
							logger.error({
								error,
								message: 'Failed to upsert message',
								messageId: message.key.id,
								remoteJid: jid,
								sessionId
							});
							// Don't throw the error to prevent crashing the handler
						}

						const chatExists = (await prisma.chat.count({ where: { id: jid, sessionId } })) > 0;
						if (type === "notify" && !chatExists) {
							event.emit("chats.upsert", [
								{
									id: jid,
									conversationTimestamp: toNumber(message.messageTimestamp),
									unreadCount: 1,
								},
							]);
						}
					} catch (e) {
						logger.error(e, "An error occured during message upsert");
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

					if (!incomingId || !incomingRemoteJid) {
						logger.warn({ update, key }, "Skipping message update without complete message key");
						return;
					}

					const prevData = await tx.message.findUnique({
						where: {
							sessionId_remoteJid_id: {
								id: incomingId,
								remoteJid: incomingRemoteJid,
								sessionId,
							},
						},
					});
					if (!prevData) {
						return logger.info({ update }, "Got update for non existent message");
					}

					const data = { ...prevData, ...update } as proto.IWebMessageInfo;
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
						select: { userReceipt: true },
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
					});
					if (!message) {
						return logger.debug({ update }, "Got receipt update for non existent message");
					}

					let userReceipt = (message.userReceipt || []) as unknown as MessageUserReceipt[];
					const recepient = userReceipt.find((m) => m.userJid === receipt.userJid);

					if (recepient) {
						userReceipt = [...userReceipt.filter((m) => m.userJid !== receipt.userJid), receipt];
					} else {
						userReceipt.push(receipt);
					}

					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ userReceipt: userReceipt }),
						where: {
							sessionId_remoteJid_id: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
						},
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
						select: { reactions: true },
						where: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
					});
					if (!message) {
						return logger.debug({ update }, "Got reaction update for non existent message");
					}

					const authorID = getKeyAuthor(reaction.key);
					const reactions = ((message.reactions || []) as proto.IReaction[]).filter(
						(r) => getKeyAuthor(r.key) !== authorID,
					);

					if (reaction.text) reactions.push(reaction);
					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ reactions: reactions }),
						where: {
							sessionId_remoteJid_id: { id: key.id!, remoteJid: key.remoteJid!, sessionId },
						},
					});
				});
			} catch (e) {
				logger.error(e, "An error occured during message reaction update");
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

	return { listen, unlisten };
}
