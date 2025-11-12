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
		const promises: Promise<any>[] = [];

		for (const group of groups) {
			const data = transformPrisma(group);
			promises.push(
				model.upsert({
					select: { pkId: true },
					create: { ...data, sessionId },
					update: data,
					where: { sessionId_id: { id: group.id, sessionId } },
				}),
			);
		}

		try {
			await Promise.allSettled(promises);
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
				if (e instanceof PrismaClientKnownRequestError && e.code === "P2025")
					return logger.info({ update }, "Got metadata update for non existent group");
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
			const metadata = await model.findFirst({
				select: { participants: true },
				where: { id, sessionId },
			});

			if (!metadata) {
				return logger.info(
					{ update: { id, action, participants } },
					"Got participants update for non existent group",
				);
			}

			// 👇 Aseguramos que participants sea un array de objetos
			let groupParticipants = (metadata.participants as any[]) ?? [];

			switch (action) {
				case "add":
					groupParticipants = [
						...groupParticipants,
						...participants.map((id) => ({
							id,
							isAdmin: false,
							isSuperAdmin: false,
						})),
					];
					break;

				case "demote":
				case "promote":
					groupParticipants = groupParticipants.map((p) =>
						participants.includes(p.id) ? { ...p, isAdmin: action === "promote" } : p,
					);
					break;

				case "remove":
					groupParticipants = groupParticipants.filter((p) => !participants.includes(p.id));
					break;
			}

			await model.update({
				select: { pkId: true },
				data: transformPrisma({ participants: groupParticipants }),
				where: { sessionId_id: { id, sessionId } },
			});
		} catch (e) {
			logger.error(e, "An error occured during group participants update");
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("groups.upsert", upsert);
		event.on("groups.update", update);
		event.on("group-participants.update", updateParticipant);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("groups.upsert", upsert);
		event.off("groups.update", update);
		event.off("group-participants.update", updateParticipant);
		listening = false;
	};

	return { listen, unlisten };
}
