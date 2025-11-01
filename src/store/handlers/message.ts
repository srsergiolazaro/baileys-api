import type { Prisma } from "@prisma/client";

import type {
	BaileysEventEmitter,
	MessageUserReceipt,
	proto,
	WAMessage,
	WAMessageKey,
} from "baileys";

import { toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import type { Message } from "@prisma/client";

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe
		? "me"
		: key?.participantAlt || key?.participant || key?.remoteJidAlt || key?.remoteJid) || "";

const toPrismaMessage = (message: WAMessage, sessionId: string) => {
	const sanitizedMessage = message as WAMessage & {
		statusMentions?: unknown;
		messageAddOns?: unknown;
	};
	const rest = Object.fromEntries(
		Object.entries(sanitizedMessage).filter(
			([key]) => !["statusMentions", "messageAddOns"].includes(key),
		),
	);
	const transformed = transformPrisma(rest) as MakeTransformedPrisma<Message>;
	const remoteJid = message.key.remoteJid ?? transformed.remoteJid;
	const id = message.key.id ?? transformed.id;
	if (!remoteJid || !id) {
		throw new Error("Missing message key parameters");
	}
	const remoteJidAlt = message.key.remoteJidAlt ?? transformed.remoteJidAlt ?? null;
	const participant = message.key.participant ?? transformed.participant;
	const participantAlt = message.key.participantAlt ?? transformed.participantAlt;
	const addressingMode = message.key.addressingMode ?? transformed.addressingMode ?? null;

	const createData: MakeTransformedPrisma<Message> = {
		...transformed,
		sessionId,
		id,
		remoteJid,
		remoteJidAlt,
		participant: participant ?? null,
		participantAlt: participantAlt ?? null,
		addressingMode,
		messageStubParameters: transformed.messageStubParameters ?? [],
		labels: transformed.labels ?? [],
		userReceipt: transformed.userReceipt ?? [],
		reactions: transformed.reactions ?? [],
		pollUpdates: transformed.pollUpdates ?? [],
		eventResponses: transformed.eventResponses ?? [],
		statusMentionSources: (transformed.statusMentionSources || []) as Prisma.InputJsonValue[],
		supportAiCitations: (transformed.supportAiCitations || []) as Prisma.InputJsonValue[],
	};

	const updateData = {
		...transformed,
		remoteJidAlt,
		participant: participant ?? undefined,
		participantAlt: participantAlt ?? undefined,
		addressingMode,
		statusMentionSources: (transformed.statusMentionSources || []) as Prisma.InputJsonValue[],
		supportAiCitations: (transformed.supportAiCitations || []) as Prisma.InputJsonValue[],
	} as Partial<MakeTransformedPrisma<Message>>;

	delete (updateData as Record<string, unknown>).sessionId;
	delete (updateData as Record<string, unknown>).remoteJid;
	delete (updateData as Record<string, unknown>).id;

	return { createData, updateData, remoteJid, id };
};

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ messages, isLatest }) => {
		try {
			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.message.deleteMany({ where: { sessionId } });

				const records = messages.flatMap((message) => {
					try {
						return [toPrismaMessage(message, sessionId).createData];
					} catch (error) {
						logger.warn(
							{ err: error, sessionId, messageId: message.key?.id },
							"Skipping message during history sync due to missing key data",
						);
						return [];
					}
				});

				if (records.length > 0) {
					// ESTA LÍNEA ES LA QUE CAMBIA
					await tx.message.createMany({
						data: records as (Message & {
							statusMentionSources: Prisma.InputJsonValue[];
							supportAiCitations: Prisma.InputJsonValue[];
						})[],
					});
				}
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
						const { createData, updateData, remoteJid, id } = toPrismaMessage(message, sessionId);
						try {
							await prisma.message.upsert({
								select: { pkId: true },
								create: createData as Message & {
									statusMentionSources: Prisma.InputJsonValue[];
									supportAiCitations: Prisma.InputJsonValue[];
								},
								update: updateData as Message & {
									statusMentionSources: Prisma.InputJsonValue[];
									supportAiCitations: Prisma.InputJsonValue[];
								},
								where: {
									sessionId_remoteJid_id: {
										remoteJid,
										id,
										sessionId,
									},
								},
							});
						} catch (error) {
							console.log("Error in Upsert");
						}

						const chatExists =
							(await prisma.chat.count({ where: { id: remoteJid, sessionId } })) > 0;
						if (type === "notify" && !chatExists) {
							event.emit("chats.upsert", [
								{
									id: remoteJid,
									conversationTimestamp: toNumber(message.messageTimestamp),
									unreadCount: 1,
									pnJid: message.key.remoteJidAlt?.includes("@s.whatsapp.net")
										? message.key.remoteJidAlt
										: undefined,
								},
							]);
						}
					} catch (e) {
						logger.error(
							{ err: e, sessionId, messageId: message.key?.id },
							"An error occured during message upsert",
						);
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
					const prismaData = Object.fromEntries(
						Object.entries(transformed).filter(
							([key]) => !["pkId", "sessionId", "remoteJid", "id"].includes(key),
						),
					);

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
