import { logger } from '@/shared';
import { getSession } from '@/whatsapp';
import type { Store } from '@/store/store';
import type { Request, Response } from 'express';

/**
 * Creates or updates a label.
 */
export const add = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: 'Session ID is required' });
		}

		const { label } = req.body;
		const session = getSession(appData.sessionId)!;

		if (!label || (!label.name && !label.id)) {
			return res.status(400).json({ error: 'Label name or id is required' });
		}

		// Baileys addLabel(jid, labels)
		// jid is usually empty for global labels
		await (session as any).addLabel('', label);
		res.status(200).json({ message: 'Label added/updated successfully' });
	} catch (e) {
		const message = 'An error occurred during label add';
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

/**
 * Adds a chat to a label.
 */
export const addChat = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: 'Session ID is required' });
		}

		const { jid, labelId } = req.body;
		if (!jid || !labelId) {
			return res.status(400).json({ error: 'JID and labelId are required' });
		}

		const session = getSession(appData.sessionId)!;
		await (session as any).addChatLabel(jid, labelId);
		res.status(200).json({ message: 'Chat added to label successfully' });
	} catch (e) {
		const message = 'An error occurred during adding chat to label';
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

/**
 * Removes a chat from a label.
 */
export const removeChat = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: 'Session ID is required' });
		}

		const { jid, labelId } = req.body;
		if (!jid || !labelId) {
			return res.status(400).json({ error: 'JID and labelId are required' });
		}

		const session = getSession(appData.sessionId)!;
		await (session as any).removeChatLabel(jid, labelId);
		res.status(200).json({ message: 'Chat removed from label successfully' });
	} catch (e) {
		const message = 'An error occurred during removing chat from label';
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

/**
 * Lists all labels.
 */
export const list = async (req: Request, res: Response) => {
	try {
		const appData = req.appData;
		if (!appData?.sessionId) {
			return res.status(400).json({ error: 'Session ID is required' });
		}

		const session = getSession(appData.sessionId)!;
		const store = (session as any).store as Store;

		if (!store) {
			return res.status(500).json({ error: 'Store not found for session' });
		}

		const labels = store.getAllLabels();
		res.status(200).json(labels);
	} catch (e) {
		const message = 'An error occurred during listing labels';
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
