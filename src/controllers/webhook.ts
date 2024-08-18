import type { RequestHandler } from "express";
import { prisma } from "@/db";
import { logger } from "@/shared";

export const list: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const webhooks = await prisma.webhook.findMany({ where: { sessionId } });
		res.status(200).json(webhooks);
	} catch (e) {
		const message = "An error occurred while fetching webhooks";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const create: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { url } = req.body;
		const webhook = await prisma.webhook.create({
			data: { sessionId, url },
		});
		res.status(201).json(webhook);
	} catch (e) {
		const message = "An error occurred while creating the webhook";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const update: RequestHandler = async (req, res) => {
	try {
		const { id } = req.params;
		const { url } = req.body;
		const webhook = await prisma.webhook.update({
			where: { id: Number(id) },
			data: { url },
		});
		res.status(200).json(webhook);
	} catch (e) {
		const message = "An error occurred while updating the webhook";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const remove: RequestHandler = async (req, res) => {
	try {
		const { id } = req.params;
		await prisma.webhook.delete({
			where: { id: Number(id) },
		});
		res.status(200).json({ message: "Webhook deleted successfully" });
	} catch (e) {
		const message = "An error occurred while deleting the webhook";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
