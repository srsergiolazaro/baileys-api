import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession, jidExists } from "@/whatsapp";

const updateBlockStatus =
	(action: "block" | "unblock"): RequestHandler =>
		async (req, res) => {
			try {
				const session = getSession(req.appData.sessionId)!;
				const { jid } = req.body;

				const { exists, formatJid } = await jidExists(session, jid);
				if (!exists) return res.status(400).json({ error: "Jid does not exist" });

				await session.updateBlockStatus(formatJid, action);
				res.status(200).json({ message: `Contact ${action}ed` });
			} catch (e) {
				const message = `An error occured during contact ${action}`;
				logger.error(e, message);
				res.status(500).json({ error: message });
			}
		};

export const block = updateBlockStatus("block");
export const unblock = updateBlockStatus("unblock");

export const updateProfilePicture: RequestHandler = async (req, res) => {
	try {
		const session = getSession(req.appData.sessionId)!;
		const { jid, url } = req.body;

		if (!jid) {
			return res.status(400).json({ error: "JID is required" });
		}
		const { exists, formatJid } = await jidExists(session, jid);

		if (!exists) return res.status(400).json({ error: "Jid does not exist" });

		if (url) {
			await session.updateProfilePicture(formatJid, { url });
		} else {
			await session.removeProfilePicture(formatJid);
		}

		res.status(200).json({
			success: true,
			message: `Profile picture ${url ? "updated" : "removed"} successfully`,
		});
	} catch (e: unknown) {
		const message = "An error occurred while updating profile picture";
		const error = e as Error;
		logger.error(error, message);
		res.status(500).json({
			success: false,
			error: message,
			details: error.message,
		});
	}
};
