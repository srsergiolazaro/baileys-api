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
		const { url, webhookType } = req.body;
		const webhook = await prisma.webhook.create({
			data: { sessionId, url, webhookType },
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
		const { url, webhookType } = req.body;

		if (!url && !webhookType) {
			return res.status(400).json({ error: "Either url or webhookType must be provided" });
		}

		const data: { url?: string; webhookType?: string } = {};
		if (url) data.url = url;
		if (webhookType) data.webhookType = webhookType;

		const webhook = await prisma.webhook.update({
			where: { id: Number(id) },
			data,
		});
		res.status(200).json(webhook);
	} catch (e) {
		const message = "An error occurred while updating the webhook";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const checkByUrl: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { url, webhookType } = req.query;

		const webhooks = await prisma.webhook.findMany({
			where: {
				sessionId,
				url: url as string,
				...(webhookType && { webhookType: webhookType as string }),
			},
		});

		if (webhooks.length === 0) {
			return res.status(404).json({ error: "Webhook not found" });
		}

		res.status(200).json(webhooks);
	} catch (e) {
		const message = "An error occurred while checking the webhook";
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
