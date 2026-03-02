import type { RequestHandler } from 'express';
import { logger } from '../shared';
import { getSession, jidExists } from '@/whatsapp';

export const makePhotoURLHandler =
	(): RequestHandler =>
	async (req, res) => {
		try {
			const { sessionId, jid } = req.appData;

			if (!jid) {
				return res.status(400).json({ error: 'JID is required' });
			}

			const session = getSession(sessionId)!;

			const { exists, formatJid } = await jidExists(session, jid);
			if (!exists) return res.status(400).json({ error: 'Jid does not exist' });

			const url = await session.profilePictureUrl(formatJid, 'image');
			res.status(200).json({ url });
		} catch (e) {
			const message = 'An error occured during photo fetch';
			logger.error(e, message);
			res.status(500).json({ error: message });
		}
	};
