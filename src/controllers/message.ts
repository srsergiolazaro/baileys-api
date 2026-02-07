import type { proto, WAGenericMediaMessage, WAMessage } from "baileys";
import { downloadMediaMessage, downloadContentFromMessage } from "baileys";
import { serializePrisma } from "@/utils";
import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { delay as delayMs } from "@/utils";
import { getSession, jidExists, listSessions } from "@/whatsapp";
import { prisma } from "@/db";
import type { Message } from "@prisma/client";

export const list: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.appData;
		const { cursor = undefined, limit = 25 } = req.query;
		const messages = (
			await prisma.message.findMany({
				cursor: cursor ? { pkId: Number(cursor) } : undefined,
				take: Number(limit),
				skip: cursor ? 1 : 0,
				where: { sessionId },
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
		const message = "An error occured during message list";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};


export const send: RequestHandler = async (req, res) => {

	try {
		let { jid, message, options } = req.body;

		// Procesa los datos de form-data si existen
		if (req.is("multipart/form-data")) {
			jid = req.body.jid;
			try {
				message = req.body.message ? JSON.parse(req.body.message) : undefined;
			} catch (e) {
				logger.error("Error parsing message JSON in multipart request", e);
			}
			try {
				options = req.body.options ? JSON.parse(req.body.options) : undefined;
			} catch (e) {
				logger.error("Error parsing options JSON in multipart request", e);
			}

			// Si se envía un archivo, ajusta el mensaje para que sea compatible con Buffer
			if (req.file) {
				const mediaType = req.file.mimetype.split("/")[0]; // 'image' o 'document'
				message = {
					...message, // Concatenar con el mensaje enviado por el usuario
					[mediaType]: req.file.buffer,
				};
			}
		}

		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(400).json({ error: "Session not found or not connected" });
		}

		const { exists, formatJid, error } = await jidExists(session, jid);
		if (!exists) {
			return res.status(400).json({
				error: error || "JID does not exist",
				details: `Failed to verify JID: ${jid}`,
			});
		}

		try {
			const result = await session.sendMessage(formatJid, message, options);
			return res.status(200).json(result);
		} catch (sendError) {
			const errorMessage = `Failed to send message: ${sendError instanceof Error ? sendError.message : "Unknown error"}`;
			logger.error(sendError, errorMessage);
			return res.status(500).json({
				error: errorMessage,
				details: sendError instanceof Error ? sendError.stack : undefined,
			});
		}
	} catch (e) {
		const errorMessage = "An error occurred during message send";
		logger.error(e, errorMessage);
		return res.status(500).json({
			error: errorMessage,
			details: e instanceof Error ? e.stack : undefined,
		});
	}
};

export const sendBulk: RequestHandler = async (req, res) => {
	const session = getSession(req.appData.sessionId)!;
	const results: { index: number; result: WAMessage | undefined }[] = [];
	const errors: { index: number; error: string }[] = [];

	for (const [index, data] of req.body.entries()) {
		try {
			let { jid, type = "number", message, options } = data;
			const delay = data.delay || 1000; // 'delay' es constante porque no se reasigna

			// Procesa los datos de form-data si existen
			if (req.is("multipart/form-data")) {
				jid = data.jid;
				type = data.type || "number";
				try {
					message = data.message ? JSON.parse(data.message) : undefined;
				} catch (e) {
					logger.error("Error parsing bulk message JSON in multipart request", e);
				}
				try {
					options = data.options ? JSON.parse(data.options) : undefined;
				} catch (e) {
					logger.error("Error parsing bulk options JSON in multipart request", e);
				}

				// Si se envía un archivo, ajusta el mensaje para que sea compatible con Buffer
				if (req.file) {
					const mediaType = req.file.mimetype.split("/")[0]; // 'image' o 'document'
					message = {
						...message, // Concatenar con el mensaje enviado por el usuario
						[mediaType]: req.file.buffer,
					};
				}
			}

			// Verificar si el JID existe
			const { exists, formatJid } = await jidExists(session, jid);
			if (!exists) {
				errors.push({ index, error: "JID does not exist" });
				continue;
			}

			// Aplicar el retraso antes de enviar el siguiente mensaje si no es el primer mensaje
			if (index > 0) await delayMs(delay);

			// Enviar el mensaje
			const result = await session.sendMessage(formatJid, message, options);
			results.push({ index, result });
		} catch (e) {
			const errorMessage = "An error occurred during message send";
			logger.error(e, errorMessage);
			errors.push({ index, error: errorMessage });
		}
	}

	// Devolver resultados y errores
	res
		.status(req.body.length !== 0 && errors.length === req.body.length ? 500 : 200)
		.json({ results, errors });
};

export const download: RequestHandler = async (req, res) => {
	try {
		const session = getSession(req.appData.sessionId)!;
		const message = req.body as WAMessage;
		const type = Object.keys(message.message!)[0] as keyof proto.IMessage;
		const content = message.message![type] as WAGenericMediaMessage;
		const buffer = await downloadMediaMessage(
			message,
			"buffer",
			{},
			{ logger, reuploadRequest: session.updateMediaMessage },
		);

		res.setHeader("Content-Type", content.mimetype!);
		res.write(buffer);
		res.end();
	} catch (e) {
		const message = "An error occured during message media download";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};


