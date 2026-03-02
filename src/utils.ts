import type { Session } from './types';
import { logger } from './shared';

export const serializePrisma = (obj: any) => {
	return JSON.parse(
		JSON.stringify(obj, (key, value) => {
			if (typeof value === 'bigint') {
				return value.toString();
			}
			return value;
		}),
	);
};

export function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	errorMessage = 'Operation timed out',
): Promise<T> {
	let timeoutId: NodeJS.Timeout;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(errorMessage));
		}, ms);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		clearTimeout(timeoutId);
	});
}

const detectJidType = (jid: string): 'group' | 'number' | 'lid' => {
	const normalized = jid.toLowerCase();
	if (normalized.endsWith('@g.us')) return 'group';
	if (normalized.endsWith('@lid')) return 'lid';
	if (normalized.endsWith('@s.whatsapp.net')) return 'number';
	return 'number';
};

function normalizePhoneNumber(input: string): string {
	// 1. Quitar espacios y símbolos comunes
	const cleaned = input.replace(/[\s()-]/g, '');

	// 2. Si empieza con '+', eliminarlo
	const withoutPlus = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

	// 3. Dejar solo dígitos
	const digits = withoutPlus.replace(/\D+/g, '');

	// 4. Validar que tenga al menos un código país + número (7-15 dígitos según E.164)
	if (digits.length >= 7 && digits.length <= 15) {
		return digits;
	}

	throw new Error('Invalid phone number format');
}

export async function jidExists(
	session: Session | undefined,
	jid: string,
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	logger.debug({ jid }, '[jidExists] input received');

	const cleanInput = jid.trim();
	logger.debug({ cleanInput }, '[jidExists] clean input');

	try {
		const resolvedType = detectJidType(cleanInput);
		logger.debug({ resolvedType }, '[jidExists] resolved JID type');

		// ======================
		// LID (Linked Identity) — sendMessage soporta @lid directo, onWhatsApp no
		// ======================
		if (resolvedType === 'lid') {
			logger.debug({ cleanInput }, '[jidExists] LID JID, passing through directly');
			return { exists: true, formatJid: cleanInput };
		}

		// ======================
		// NUMBER
		// ======================
		if (resolvedType === 'number') {
			const rawNumber = cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput;

			logger.debug({ rawNumber }, '[jidExists] raw number extracted');

			const normalizedNumber = normalizePhoneNumber(rawNumber);
			logger.debug({ normalizedNumber }, '[jidExists] normalized phone number');

			const formattedJid = `${normalizedNumber}@s.whatsapp.net`;
			logger.debug({ formattedJid }, '[jidExists] formatted number JID');

			// Se ha retirado la validación en red a petición del usuario
			// para mejorar la velocidad al máximo asumiendo que el número existe.
			return { exists: true, formatJid: formattedJid };
		}

		// ======================
		// GROUP
		// ======================
		const formattedGroupJid = cleanInput.includes('@') ? cleanInput : `${cleanInput}@g.us`;

		logger.debug({ formattedGroupJid }, '[jidExists] formatted group JID');

		// Se asume que el grupo existe por la misma razón
		return { exists: true, formatJid: formattedGroupJid };
	} catch (e) {
		logger.error(
			{
				error: e,
				jid: cleanInput,
			},
			'[jidExists] unhandled error',
		);

		return {
			exists: false,
			formatJid: cleanInput,
			error: e instanceof Error ? e.message : 'Unknown error',
		};
	}
}
