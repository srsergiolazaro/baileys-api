import type { ParticipantAction, WAMessage, WASocket } from "baileys";
import { downloadMediaMessage } from "baileys";
import { webhookCache } from "@/webhook-cache";
import { logger } from "@/shared";
import { callWebHook, callWebHookFile } from "@/fetch";

export async function handleMessagesUpsert(
	socket: WASocket,
	m: { messages: WAMessage[]; type: "notify" | "append" },
	sessionId: string,
	readIncomingMessages?: boolean,
) {
	const message = m.messages[0];

	if (readIncomingMessages) {
		if (message.key.fromMe || m.type !== "notify") return;
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

	try {
		// Usar el caché en lugar de consultar la DB siempre
		const webhooks = await webhookCache.getWebhooks(sessionId, "messages.upsert");
		if (webhooks.length === 0) return;

		// Si hay media, descargarla UNA SOLA VEZ fuera del bucle de webhooks
		let mediaBuffer: Buffer | undefined;
		if (documentMessageTypes.includes(messageType)) {
			mediaBuffer = await downloadMediaMessage(
				message,
				"buffer",
				{},
				{
					logger,
					reuploadRequest: socket.updateMediaMessage,
				},
			);
		}

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
			} else if (mediaBuffer) {
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
					mediaBuffer,
				);
			}
		});

		await Promise.allSettled(webhookPromises);
	} catch (error) {
		logger.error(error, "Failed to process webhooks for message");
	}
}

export async function handleGroupParticipantsUpdate(
	socket: WASocket,
	update: { id: string; author: string; participants: string[]; action: ParticipantAction },
	sessionId: string,
) {
	try {
		const webhooks = await webhookCache.getWebhooks(sessionId, "group-participants.update");
		if (webhooks.length === 0) return;

		const webhookPromises = webhooks.map((webhook) =>
			callWebHook(webhook.url, {
				...update,
				session: sessionId,
			}),
		);

		await Promise.allSettled(webhookPromises);
	} catch (error) {
		logger.error(error, "Failed to send group participants update to webhooks");
	}
}
