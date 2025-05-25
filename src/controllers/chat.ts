import { serializePrisma } from "../store";
import { logger } from "@/shared";
import { prisma } from "@/db";
import type { Chat, Message } from "@prisma/client";
import { getSession } from "@/whatsapp";
import type { Request, Response } from "express";


export const list = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: "Session ID is required" });
		}

		const { sessionId } = appData;
		const { cursor = undefined, limit = 25 } = req.query;
		const chats = (
			await prisma.chat.findMany({
				cursor: cursor ? { pkId: Number(cursor) } : undefined,
				take: Number(limit),
				skip: cursor ? 1 : 0,
				where: { sessionId },
			})
		).map((c: Chat) => serializePrisma(c));

		res.status(200).json({
			data: chats,
			cursor:
				chats.length !== 0 && chats.length === Number(limit) ? chats[chats.length - 1].pkId : null,
		});
	} catch (e) {
		const message = "An error occured during chat list";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const find = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId || !appData?.jid) {
			return res.status(400).json({ error: "Session ID and JID are required" });
		}

		const { sessionId, jid } = appData;
		const { cursor = undefined, limit = 25 } = req.query;
		const messages = (
			await prisma.message.findMany({
				cursor: cursor ? { pkId: Number(cursor) } : undefined,
				take: Number(limit),
				skip: cursor ? 1 : 0,
				where: { sessionId, remoteJid: jid },
				orderBy: { messageTimestamp: "desc" },
			})
		).map((m: Message) => serializePrisma(m));

		res.status(200).json({
			data: messages,
			cursor:
				messages.length !== 0 && messages.length === Number(limit)
					? messages[messages.length - 1].pkId
					: null,
		});
	} catch (e) {
		const message = "An error occured during chat find";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const mute = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: "Session ID is required" });
		}

		const { jid, duration } = req.body;
		const session = getSession(appData.sessionId)!;
		await session.chatModify({ mute: duration }, jid);
		res.status(200).json({ message: "Chat muted successfully" });
	} catch (e) {
		const message = "An error occured during chat mute";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const markRead = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: "Session ID is required" });
		}

		const { jid, messageIds } = req.body;
		const session = getSession(appData.sessionId)!;
		await session.readMessages(messageIds.map((id: string) => ({ remoteJid: jid, id })));
		res.status(200).json({ message: "Messages marked as read successfully" });
	} catch (e) {
		const message = "An error occured during mark read";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const setDisappearing = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: "Session ID is required" });
		}

		const { jid, duration = 604800 } = req.body; // default duration to 1 week
		const session = getSession(appData.sessionId)!;
		await session.sendMessage(jid, { disappearingMessagesInChat: duration });
		res.status(200).json({ message: "Disappearing messages set successfully" });
	} catch (e) {
		const message = "An error occured during setting disappearing messages";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
