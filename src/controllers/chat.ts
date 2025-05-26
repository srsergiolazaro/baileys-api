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
		const { cursor, limit = "25" } = req.query;

		// Validar y convertir limit
		const parsedLimit = parseInt(limit as string, 10);
		if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
			return res.status(400).json({ error: "Invalid limit parameter" });
		}

		// Validar y convertir cursor
		let parsedCursor: number | undefined;
		if (cursor) {
			parsedCursor = parseInt(cursor as string, 10);
			if (isNaN(parsedCursor)) {
				return res.status(400).json({ error: "Invalid cursor parameter" });
			}
		}

		// Definir serializePrisma ANTES de usarla
		const serializePrisma = (obj: any) => {
			return JSON.parse(
				JSON.stringify(obj, (key, value) => {
					if (typeof value === "bigint") {
						return value.toString();
					}
					return value;
				}),
			);
		};

		const chats = (
			await prisma.chat.findMany({
				cursor: parsedCursor ? { pkId: parsedCursor } : undefined,
				take: parsedLimit,
				skip: parsedCursor ? 1 : 0,
				where: { sessionId },
			})
		).map((c: Chat) => serializePrisma(c));

		res.status(200).json({
			data: chats,
			cursor:
				chats.length !== 0 && chats.length === parsedLimit
					? chats[chats.length - 1].pkId.toString() // También convierte el cursor
					: null,
		});
	} catch (e) {
		const message = "An error occurred during chat list";
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
		const messagesFromDb = await prisma.message.findMany({
			cursor: cursor ? { pkId: Number(cursor) } : undefined,
			take: Number(limit),
			skip: cursor ? 1 : 0,
			where: { sessionId, remoteJid: jid },
			orderBy: { messageTimestamp: "desc" },
		});

		const messages = messagesFromDb.map((m: Message) => {
			const serializedMessage = serializePrisma(m) as any; // Cast to any to handle pkId potentially being bigint
			// Convert BigInt fields to string for JSON serialization
			const messageToReturn = { ...serializedMessage };
			if (serializedMessage.pkId && typeof serializedMessage.pkId === "bigint") {
				messageToReturn.pkId = serializedMessage.pkId.toString();
			}
			// Si messageTimestamp también fuera BigInt y causara problemas, se convertiría similarmente:
			// if (serializedMessage.messageTimestamp && typeof serializedMessage.messageTimestamp === 'bigint') {
			//   messageToReturn.messageTimestamp = serializedMessage.messageTimestamp.toString();
			// }
			return messageToReturn;
		});

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
