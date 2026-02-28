import { type BaileysEventEmitter } from 'baileys';
import { type BaileysEventHandler } from '@/store/types';
import { logger } from '@/shared';

export interface Label {
	/** Label uniq ID */
	id: string;
	/** Label name */
	name: string;
	/** Label color ID */
	color: number;
	/** Is label has been deleted */
	deleted: boolean;
	/** WhatsApp has 5 predefined labels (New customer, New order & etc) */
	predefinedId?: string;
}

export default function labelHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;
	const labels = new Map<string, Label>();

	const edit: BaileysEventHandler<'labels.edit'> = async (label) => {
		try {
			if (label.deleted) {
				labels.delete(label.id);
			} else {
				labels.set(label.id, label);
			}
		} catch (e) {
			logger.error(e, 'An error occured during label edit');
		}
	};

	const association: BaileysEventHandler<'labels.association'> = async ({ association, type }) => {
		try {
			logger.debug({ association, type, sessionId }, 'Label association event');
			// association includes labelId, chatJid, etc.
			// Depending on requirements, we might want to store this too,
			// but for now the user specifically asked for getAllLabels()
		} catch (e) {
			logger.error(e, 'An error occured during label association');
		}
	};

	const getAllLabels = (): Label[] => {
		return Array.from(labels.values());
	};

	const listen = () => {
		if (listening) return;

		event.on('labels.edit', edit);
		event.on('labels.association', association);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off('labels.edit', edit);
		event.off('labels.association', association);
		listening = false;
	};

	return { listen, unlisten, getAllLabels };
}
