import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession } from "@/whatsapp";

export const create: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { name, description } = req.body as { name: string; description?: string };
		const session = getSession(sessionId)!;

		const newsletter = await session.newsletterCreate(name, description);

		res.status(201).json({
			success: true,
			data: newsletter,
		});
	} catch (e) {
		const message = "An error occurred during newsletter creation";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const metadata: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { jid } = req.body as { jid: string };
		const session = getSession(sessionId)!;

		const meta = await session.newsletterMetadata("jid", jid);

		res.status(200).json({
			success: true,
			data: meta,
		});
	} catch (e) {
		const message = "An error occurred fetching newsletter metadata";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const subscribe: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { jid } = req.body as { jid: string };
		const session = getSession(sessionId)!;

		await session.newsletterFollow(jid);

		res.status(200).json({
			success: true,
			message: "Subscribed to newsletter successfully",
		});
	} catch (e) {
		const message = "An error occurred subscribing to newsletter";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const unsubscribe: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { jid } = req.body as { jid: string };
		const session = getSession(sessionId)!;

		await session.newsletterUnfollow(jid);

		res.status(200).json({
			success: true,
			message: "Unsubscribed from newsletter successfully",
		});
	} catch (e) {
		const message = "An error occurred unsubscribing from newsletter";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const send: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { jid, text } = req.body as { jid: string; text: string };
		const session = getSession(sessionId)!;

		const result = await session.sendMessage(jid, { text });

		res.status(200).json({
			success: true,
			data: result,
		});
	} catch (e) {
		const message = "An error occurred sending message to newsletter";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
