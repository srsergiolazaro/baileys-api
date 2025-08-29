import { type BaileysEventEmitter } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Chat } from "@prisma/client";

export default function chatHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ chats, isLatest }) => {
		try {
			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.chat.deleteMany({ where: { sessionId } });

				const existingIds = (
					await tx.chat.findMany({
						select: { id: true },
						where: { id: { in: chats.map((c) => c.id) }, sessionId },
					})
				).map((i) => i.id);
				const chatsAdded = (
					await tx.chat.createMany({
						data: chats
							.filter((c) => !existingIds.includes(c.id))
							.map((c) => ({
								...(transformPrisma(c) as MakeTransformedPrisma<Chat>),
								sessionId,
							})),
					})
				).count;

				logger.info({ chatsAdded }, "Synced chats");
			});
		} catch (e) {
			logger.error(e, "An error occured during chats set");
		}
	};

	const upsert: BaileysEventHandler<"chats.upsert"> = async (chats) => {
		try {
			await Promise.any(
				chats
					.map((c) => transformPrisma(c) as MakeTransformedPrisma<Chat>)
					.map((data) =>
						prisma.chat.upsert({
							select: { pkId: true },
							create: { ...data, sessionId },
							update: data,
							where: { sessionId_id: { id: data.id, sessionId } },
						}),
					),
			);
		} catch (e) {
			logger.error(e, "An error occured during chats upsert");
		}
	};

	const update: BaileysEventHandler<"chats.update"> = async (updates) => {
		for (const update of updates) {
			try {
				// Only include properties that exist in the update object
				const chatData: Partial<{
					conversationTimestamp?: number | Long | null;
					unreadCount?: number | null;
					readOnly?: boolean | null;
					ephemeralExpiration?: number | null;
					ephemeralSettingTimestamp?: number | Long | null;
					name?: string | null;
					notSpam?: boolean | null;
					archived?: boolean | null;
					disappearingMode?: any;
					lastMsgTimestamp?: number | Long | null;
					mediaVisibility?: any; // MediaVisibility type from baileys
				}> = {};

				// Only assign properties that exist in the update object and are not null/undefined
				const safeAssign = <T>(key: string, value: T | null | undefined) => {
					if (value !== null && value !== undefined) {
						chatData[key as keyof typeof chatData] = value as any;
					}
				};

				// Assign each property if it exists in the update
				if ('conversationTimestamp' in update) safeAssign('conversationTimestamp', update.conversationTimestamp);
				if ('unreadCount' in update) safeAssign('unreadCount', update.unreadCount);
				if ('readOnly' in update) safeAssign('readOnly', update.readOnly);
				if ('ephemeralExpiration' in update) safeAssign('ephemeralExpiration', update.ephemeralExpiration);
				if ('ephemeralSettingTimestamp' in update) safeAssign('ephemeralSettingTimestamp', update.ephemeralSettingTimestamp);
				if ('name' in update) safeAssign('name', update.name);
				if ('notSpam' in update) safeAssign('notSpam', update.notSpam);
				if ('archived' in update) safeAssign('archived', update.archived);
				if ('disappearingMode' in update) safeAssign('disappearingMode', update.disappearingMode);
				if ('lastMsgTimestamp' in update) safeAssign('lastMsgTimestamp', update.lastMsgTimestamp);
				if ('mediaVisibility' in update) safeAssign('mediaVisibility', update.mediaVisibility);

				const data = transformPrisma(chatData);

				// Check if chat exists before updating
				const chatExists = await prisma.chat.findUnique({
					where: { sessionId_id: { id: update.id!, sessionId } }
				});

				if (!chatExists) {
					logger.warn({ chatId: update.id }, 'Attempted to update non-existent chat');
					return;
				}

				await prisma.chat.update({
					select: { pkId: true },
					data: {
						...data,
						unreadCount:
							typeof data.unreadCount === "number"
								? data.unreadCount > 0
									? { increment: data.unreadCount }
									: { set: data.unreadCount }
								: undefined,
					},
					where: { sessionId_id: { id: update.id!, sessionId } },
				});
			} catch (e) {
				if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
					return logger.info({ update }, "Got update for non existent chat");
				}
				logger.error(e, "An error occured during chat update");
			}
		}
	};

	const del: BaileysEventHandler<"chats.delete"> = async (ids) => {
		try {
			await prisma.chat.deleteMany({
				where: { id: { in: ids } },
			});
		} catch (e) {
			logger.error(e, "An error occured during chats delete");
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("chats.upsert", upsert);
		event.on("chats.update", update);
		event.on("chats.delete", del);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("chats.upsert", upsert);
		event.off("chats.update", update);
		event.off("chats.delete", del);
		listening = false;
	};

	return { listen, unlisten };
}
