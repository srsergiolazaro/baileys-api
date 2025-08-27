import { downloadMediaMessage, type WASocket, type WAMessage, type proto } from "baileys";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { delay } from "@/utils";
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

		await delay(1000);
		await socket.readMessages([message.key]);
	}

	if (!m.messages || !message.message) return;

	if (message.key.fromMe) {
		console.log("Mensaje enviado:", message.message);
	} else {
		console.log("Mensaje recibido:", message.message);
	}

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
		const webhooks = await prisma.webhook.findMany({ where: { sessionId } });

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
