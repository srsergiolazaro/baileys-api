import type { proto, WAGenericMediaMessage, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage, downloadContentFromMessage } from "@whiskeysockets/baileys";
import { serializePrisma } from "@/store";
import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { delay as delayMs } from "@/utils";
import { getSession, jidExists } from "@/whatsapp";
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
		let { jid, type = "number", message, options } = req.body;

		// Procesa los datos de form-data si existen
		if (req.is("multipart/form-data")) {
			jid = req.body.jid;
			type = req.body.type || "number";
			message = req.body.message ? JSON.parse(req.body.message) : undefined;
			options = req.body.options ? JSON.parse(req.body.options) : undefined;

			// Si se envía un archivo, ajusta el mensaje para que sea compatible con Buffer
			if (req.file) {
				const mediaType = req.file.mimetype.split("/")[0]; // 'image' o 'document'
				message = {
					...message, // Concatenar con el mensaje enviado por el usuario
					[mediaType]: req.file.buffer,
				};
			}
		}

		const session = getSession(req.appData.sessionId)!;

		const { exists, formatJid } = await jidExists(session, jid, type);
		if (!exists) return res.status(400).json({ error: "JID does not exist" });

		const result = await session.sendMessage(formatJid, message, options);
		res.status(200).json(result);
	} catch (e) {
		const errorMessage = "An error occurred during message send";
		logger.error(e, errorMessage);
		res.status(500).json({ error: errorMessage });
	}
};

export const sendBulk: RequestHandler = async (req, res) => {
	const session = getSession(req.appData.sessionId)!;
	const results: { index: number; result: proto.WebMessageInfo | undefined }[] = [];
	const errors: { index: number; error: string }[] = [];

	for (const [index, data] of req.body.entries()) {
		try {
			let { jid, type = "number", message, options } = data;
			const delay = data.delay || 1000; // 'delay' es constante porque no se reasigna

			// Procesa los datos de form-data si existen
			if (req.is("multipart/form-data")) {
				jid = data.jid;
				type = data.type || "number";
				message = data.message ? JSON.parse(data.message) : undefined;
				options = data.options ? JSON.parse(data.options) : undefined;

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
			const { exists, formatJid } = await jidExists(session, jid, type);
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

//downloadContentFromMessage

export const downloadContent: RequestHandler = async (req, res) => {
	try {
		const body = req.body;
		const buffer = await downloadContentFromMessage(body, "product");

		//res.setHeader("Content-Type", content.mimetype!);
		res.write(buffer);
		res.end();
	} catch (e) {
		const message = "An error occured during message media download";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
