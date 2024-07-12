import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession } from "@/whatsapp";
import { makePhotoURLHandler } from "./misc";
import { prisma } from "@/db";

export const list: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { cursor = undefined, limit = 25 } = req.query;
		const groups = await prisma.contact.findMany({
			cursor: cursor ? { pkId: Number(cursor) } : undefined,
			take: Number(limit),
			skip: cursor ? 1 : 0,
			where: { id: { endsWith: "g.us" }, sessionId },
		});

		res.status(200).json({
			data: groups,
			cursor:
				groups.length !== 0 && groups.length === Number(limit)
					? groups[groups.length - 1].pkId
					: null,
		});
	} catch (e) {
		const message = "An error occurred during group list";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const find: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { jid } = req.body;
		const session = getSession(sessionId)!;
		const data = await session.groupMetadata(jid);
		res.status(200).json(data);
	} catch (e) {
		const message = "An error occurred during group metadata fetch";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const create: RequestHandler = async (req, res) => {
	try {
		const { subject, participants } = req.body;
		const session = getSession(req.appData.sessionId)!;
		const group = await session.groupCreate(subject, participants);
		res.status(201).json(group);
	} catch (e) {
		const message = "An error occurred during group creation";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const update: RequestHandler = async (req, res) => {
	try {
		const { jid, subject } = req.body;
		const session = getSession(req.appData.sessionId)!;
		if (subject) {
			await session.groupUpdateSubject(jid, subject);
		}
		res.status(200).json({ message: "Group updated successfully" });
	} catch (e) {
		const message = "An error occurred during group update";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const deleteGroup: RequestHandler = async (req, res) => {
	try {
		const { jid } = req.body;
		const session = getSession(req.appData.sessionId)!;
		await session.groupLeave(jid);
		await prisma.contact.deleteMany({
			where: { id: jid },
		});
		res.status(200).json({ message: "Group deleted successfully" });
	} catch (e) {
		const message = "An error occurred during group deletion";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const updateParticipants: RequestHandler = async (req, res) => {
	try {
		const { jid, action, participants } = req.body;
		const session = getSession(req.appData.sessionId)!;
		const result = await session.groupParticipantsUpdate(jid, participants, action);
		res.status(200).json(result);
	} catch (e) {
		const message = "An error occurred during group participants update";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const updateSettings: RequestHandler = async (req, res) => {
	try {
		const { jid, settings } = req.body;
		const session = getSession(req.appData.sessionId)!;
		const result = await session.groupSettingUpdate(jid, settings);
		res.status(200).json(result);
	} catch (e) {
		const message = "An error occurred during group settings update";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const photo = makePhotoURLHandler("group");
