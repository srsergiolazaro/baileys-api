import type { ParticipantAction, GroupParticipant } from "baileys";
import { downloadMediaMessage, type WASocket, type WAMessage } from "baileys";
import { prisma } from "@/db";
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
	console.log("key", message.key);
	if (message.key) {
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
	update: { id: string; author: string; participants: string[]; action: ParticipantAction },
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
