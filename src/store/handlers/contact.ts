import type { BaileysEventEmitter } from "baileys";
import type { BaileysEventHandler } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export default function contactHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ contacts }) => {
		try {
			await prisma.$transaction(async (tx) => {
				const contactIds = contacts.map((c) => c.id);

				// Obtenemos los contactos que ya no están en la lista para borrarlos
				const oldContacts = await tx.contact.findMany({
					select: { id: true },
					where: { id: { notIn: contactIds }, sessionId },
				});
				const deletedOldContactIds = oldContacts.map((c) => c.id);

				// Ejecutamos upserts para todos los contactos nuevos/actualizados
				for (const contact of contacts) {
					const data = transformPrisma(contact);
					await tx.contact.upsert({
						select: { pkId: true },
						create: { ...data, sessionId },
						update: data,
						where: { sessionId_id: { id: data.id, sessionId } },
					});
				}

				if (deletedOldContactIds.length > 0) {
					await tx.contact.deleteMany({
						where: { id: { in: deletedOldContactIds }, sessionId }
					});
				}
			});

			logger.info(
				{ contactsCount: contacts.length },
				"Synced contacts successfully",
			);
		} catch (e) {
			logger.error(e, "An error occured during contacts set");
		}
	};

	const upsert: BaileysEventHandler<"contacts.upsert"> = async (contacts) => {
		try {
			await prisma.$transaction(
				contacts
					.map((c) => transformPrisma(c))
					.map((data) =>
						prisma.contact.upsert({
							select: { pkId: true },
							create: { ...data, sessionId },
							update: data,
							where: { sessionId_id: { id: data.id, sessionId } },
						}),
					),
			);
		} catch (e) {
			logger.error(e, "An error occured during contacts upsert");
		}
	};

	const update: BaileysEventHandler<"contacts.update"> = async (updates) => {
		try {
			await prisma.$transaction(
				updates.map((u) => {
					const data = transformPrisma(u);
					return prisma.contact.upsert({
						select: { pkId: true },
						where: { sessionId_id: { id: u.id!, sessionId } },
						update: data,
						create: { ...data, id: u.id!, sessionId } as any,
					});
				})
			);
		} catch (e) {
			logger.error(e, "An error occured during contact update");
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("contacts.upsert", upsert);
		event.on("contacts.update", update);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("contacts.upsert", upsert);
		event.off("contacts.update", update);
		listening = false;
	};

	return { listen, unlisten };
}
