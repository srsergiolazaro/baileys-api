import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession, jidExists } from "@/whatsapp";
import { makePhotoURLHandler } from "./misc";
import { prisma } from "@/db";
import type { ParticipantAction } from "@whiskeysockets/baileys";

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
		const { subject, participants }: { subject: string; participants: string[] } = req.body;
		const session = getSession(req.appData.sessionId)!;
		const participantResults = await Promise.allSettled(
			participants.map((participant) => jidExists(session, participant, "number")),
		);

		const validParticipants = participantResults
			.filter((result) => result.status === "fulfilled")
			.map((result) => result.value.formatJid);

		const group = await session.groupCreate(subject, validParticipants);
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
		const { jid }: { jid: string } = req.body;

		const session = getSession(req.appData.sessionId)!;
		const exists = await jidExists(session, jid, "group");
		if (!exists) {
			return res.status(404).json({ error: "Group not found" });
		}
		const metadata = await session.groupMetadata(jid);
		const participants = metadata.participants;

		await Promise.allSettled(
			participants
				.filter((p) => p.admin !== "superadmin")
				.map((p) => session.groupParticipantsUpdate(jid, [p.id], "remove")),
		);
		await session.groupSettingUpdate(jid, "locked");
		try {
			await session.chatModify({ archive: true, lastMessages: [] }, jid);
		} catch (e) {
			logger.error(e);
		}
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
		const {
			jid,
			action,
			participants,
		}: { jid: string; action: ParticipantAction; participants: string[] } = req.body;
		const session = getSession(req.appData.sessionId);
		if (!session) {
			const message = "Session not found";
			logger.error(message);
			return res.status(500).json({ error: message });
		}

		const participantResults = await Promise.allSettled(
			participants.map((participant) => jidExists(session, participant, "number")),
		);

		const validParticipants = participantResults
			.filter((result) => result.status === "fulfilled")
			.map((result) => result.value.formatJid);

		const result = await session.groupParticipantsUpdate(jid, validParticipants, action);
		res.status(200).json(result);
	} catch (e) {
		const message = "An error occurred during group participants update";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const updateSettings: RequestHandler = async (req, res) => {
	try {
		const {
			jid,
			settings,
		}: { jid: string; settings: "announcement" | "locked" | "not_announcement" | "unlocked" } =
			req.body;
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
