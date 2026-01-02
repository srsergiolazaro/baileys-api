import type { BaileysEventEmitter, MessageUserReceipt, proto, WAMessageKey } from "baileys";
import { jidNormalizedUser, toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import type { Message } from "@prisma/client";

function toBigIntTimestamp(ts: any): bigint | null {
	if (!ts) return null;

	// Baileys Long object
	if (typeof ts === "object" && typeof ts.low === "number" && typeof ts.high === "number") {
		return BigInt((ts.high * 2 ** 32) + ts.low);
	}

	// number or string
	return BigInt(ts);
}

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe ? "me" : key?.participant || key?.remoteJid) || "";

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ messages, isLatest }) => {
		// Mensajes ya no se guardan en DB por ahorro de espacio.
		// Solo logueamos la actividad si es necesario.
		logger.info({ messages: messages.length }, "Messaging history received (not saved to DB)");
	};

	const upsert: BaileysEventHandler<"messages.upsert"> = async ({ messages, type }) => {
		switch (type) {
			case "append":
			case "notify":
				const verifiedChats = new Set<string>();

				for (const message of messages) {
					try {
						const jid = jidNormalizedUser(message.key.remoteJid!);

						// Emitimos eventos de chat si es necesario, pero NO guardamos el mensaje en prisma.message
						if (type === "notify" && !verifiedChats.has(jid)) {
							const chatExists = (await prisma.chat.count({ where: { id: jid, sessionId } })) > 0;
							if (!chatExists) {
								event.emit("chats.upsert", [
									{
										id: jid,
										conversationTimestamp: toNumber(message.messageTimestamp),
										unreadCount: 1,
									},
								]);
							}
							verifiedChats.add(jid);
						}
					} catch (e) {
						logger.error(e, "An error occured during message processing");
					}
				}
				break;
		}
	};

	const update: BaileysEventHandler<"messages.update"> = async (updates) => {
		// No hay nada que actualizar si no guardamos mensajes
	};

	const del: BaileysEventHandler<"messages.delete"> = async (item) => {
		// No hay nada que borrar si no guardamos mensajes
	};

	const updateReceipt: BaileysEventHandler<"message-receipt.update"> = async (updates) => {
		// No guardamos recibos si no hay mensajes
	};

	const updateReaction: BaileysEventHandler<"messages.reaction"> = async (reactions) => {
		// No guardamos reacciones si no hay mensajes
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("messages.upsert", upsert);
		event.on("messages.update", update);
		event.on("messages.delete", del);
		event.on("message-receipt.update", updateReceipt);
		event.on("messages.reaction", updateReaction);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("messages.upsert", upsert);
		event.off("messages.update", update);
		event.off("messages.delete", del);
		event.off("message-receipt.update", updateReceipt);
		event.off("messages.reaction", updateReaction);
		listening = false;
	};

	return { listen, unlisten };
}
