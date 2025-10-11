import {
	downloadMediaMessage,
	DisconnectReason,
	type WASocket,
	type WAMessage,
	type proto,
	ParticipantAction,
} from "baileys";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { delay } from "@/utils";
import { callWebHook, callWebHookFile } from "@/fetch";
import type { Boom } from "@hapi/boom";

const isConnectionClosedError = (error: unknown): error is Boom =>
	Boolean(
		error &&
			typeof error === "object" &&
			(error as Boom).isBoom &&
			(error as Boom).output?.statusCode === DisconnectReason.connectionClosed,
	);

export async function handleMessagesUpsert(
	socket: WASocket,
	m: { messages: WAMessage[]; type: "notify" | "append" },
	sessionId: string,
	readIncomingMessages?: boolean,
) {
	const message = m.messages[0];

	if (readIncomingMessages) {
		if (message.key.fromMe || m.type !== "notify") return;

		await delay(1000);
		try {
			await socket.readMessages([message.key]);
		} catch (error) {
			if (isConnectionClosedError(error)) {
				logger.debug(
					{ sessionId, messageId: message.key.id },
					"Skipping read receipt because connection already closed",
				);
			} else {
				logger.error(
					{ err: error, sessionId, messageId: message.key.id },
					"Failed to mark message as read",
				);
			}
		}
	}

	if (!m.messages || !message.message) return;

	const textMessageTypes = [
		"conversation",
		"extendedTextMessage",
		"buttonsResponseMessage",
		"listResponseMessage",
		"contactMessage",
		"locationMessage",
		"liveLocationMessage",
	];
	const documentMessageTypes = ["imageMessage", "documentMessage", "audioMessage"];

	const messageType = Object.keys(message.message).find(
		(value) =>
			textMessageTypes.includes(value as keyof typeof message.message) ||
			documentMessageTypes.includes(value as keyof typeof message.message),
	) as keyof typeof message.message | undefined;

	if (!messageType) return;

	const messageContent = message.message[messageType];

	let text = "";

	if (typeof messageContent === "string") {
		text = messageContent;
	} else if (messageContent && "text" in messageContent) {
		text = messageContent.text ?? "";
	}

	if (message.key.fromMe) {
		console.log("Mensaje enviado:", text);
	} else {
		console.log("Mensaje recibido:", text);
	}

	try {
		const webhooks = await prisma.webhook.findMany({
			where: { sessionId, webhookType: "messages.upsert" },
		});

		const webhookPromises = webhooks.map(async (webhook) => {
			if (textMessageTypes.includes(messageType)) {
				return callWebHook(webhook.url, {
					message,
					messageContent,
					messageType,
					session: sessionId,
					type: "text",
					text,
				});
			} else if (documentMessageTypes.includes(messageType)) {
				const buffer = await downloadMediaMessage(
					message,
					"buffer",
					{},
					{
						logger,
						reuploadRequest: socket.updateMediaMessage,
					},
				);
				return callWebHookFile(
					webhook.url,
					{
						message,
						messageContent,
						messageType,
						session: sessionId,
						type: "file",
						text,
					},
					buffer,
				);
			}
		});

		await Promise.allSettled(webhookPromises);
		logger.info("Message sent to webhooks");
	} catch (error) {
		logger.error(error, "Failed to send message to webhooks");
	}
}

export async function handleGroupParticipantsUpdate(
	socket: WASocket,
	update: { id: string; participants: string[]; action: ParticipantAction },
	sessionId: string,
) {
	try {
		const webhooks = await prisma.webhook.findMany({
			where: { sessionId, webhookType: "group-participants.update" },
		});

		const webhookPromises = webhooks.map((webhook) =>
			callWebHook(webhook.url, {
				...update,
				session: sessionId,
			}),
		);

		await Promise.allSettled(webhookPromises);
		logger.info({ update }, "Group participants update sent to webhooks");
	} catch (error) {
		logger.error(error, "Failed to send group participants update to webhooks");
	}
}
