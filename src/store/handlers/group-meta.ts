
import type { BaileysEventEmitter } from "baileys";
import type { BaileysEventHandler } from "@/store/types";
import { transformPrisma } from "@/store/utils";
import { prisma } from "@/db";
import { logger } from "@/shared";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export default function groupMetadataHandler(sessionId: string, event: BaileysEventEmitter) {
	const model = prisma.groupMetadata;
	let listening = false;

	const upsert: BaileysEventHandler<"groups.upsert"> = async (groups) => {
		try {
			await prisma.$transaction(
				groups.map((group) => {
					const data = transformPrisma(group);
					return model.upsert({
						select: { pkId: true },
						create: { ...data, sessionId },
						update: data,
						where: { sessionId_id: { id: group.id, sessionId } },
					});
				})
			);
		} catch (e) {
			logger.error(e, "An error occured during groups upsert");
		}
	};

	const update: BaileysEventHandler<"groups.update"> = async (updates) => {
		for (const update of updates) {
			try {
				await model.update({
					select: { pkId: true },
					data: transformPrisma(update),
					where: { sessionId_id: { id: update.id!, sessionId } },
				});
			} catch (e) {
				if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") continue;
				logger.error(e, "An error occured during group metadata update");
			}
		}
	};

	const updateParticipant: BaileysEventHandler<"group-participants.update"> = async ({
		id,
		action,
		participants,
	}) => {
		try {
			// Usamos una transacción para asegurar que la lectura y escritura sean consistentes
			await prisma.$transaction(async (tx) => {
				const group = await tx.groupMetadata.findUnique({
					select: { participants: true },
					where: { sessionId_id: { id, sessionId } },
				});

				if (!group) return;

				let metadataParticipants = (group.participants || []) as any[];

				switch (action) {
					case "add":
						metadataParticipants.push(
							...participants.map((p) => ({ id: p, isAdmin: false, isSuperAdmin: false })),
						);
						break;
					case "demote":
					case "promote":
						for (const participant of metadataParticipants) {
							if (participants.includes(participant.id)) {
								participant.isAdmin = action === "promote";
							}
						}
						break;
					case "remove":
						metadataParticipants = metadataParticipants.filter((p) => !participants.includes(p.id));
						break;
				}

				await tx.groupMetadata.update({
					select: { pkId: true },
					data: { participants: metadataParticipants },
					where: { sessionId_id: { id, sessionId } },
				});
			});
		} catch (e) {
			logger.error(e, "An error occured during group participants update");
		}
	};

	const listen = () => {
		if (listening) return;

		// event.on("groups.upsert", upsert);
		// event.on("groups.update", update);
		// event.on("group-participants.update", updateParticipant);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		// event.off("groups.upsert", upsert);
		// event.off("groups.update", update);
		// event.off("group-participants.update", updateParticipant);
		listening = false;
	};

	return { listen, unlisten };
}
