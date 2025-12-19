import type { Session } from "./types";
import { logger } from "./shared";

export const serializePrisma = (obj: any) => {
	return JSON.parse(
		JSON.stringify(obj, (key, value) => {
			if (typeof value === "bigint") {
				return value.toString();
			}
			return value;
		}),
	);
};

export function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}




const detectJidType = (jid: string): "group" | "number" => {
	const normalized = jid.toLowerCase();
	if (normalized.endsWith("@g.us")) return "group";
	if (normalized.endsWith("@s.whatsapp.net")) return "number";
	return "number";
};

function normalizePhoneNumber(input: string): string {
	// 1. Quitar espacios y símbolos comunes
	const cleaned = input.replace(/[\s()-]/g, "");

	// 2. Si empieza con '+', eliminarlo
	const withoutPlus = cleaned.startsWith("+")
		? cleaned.slice(1)
		: cleaned;

	// 3. Dejar solo dígitos
	const digits = withoutPlus.replace(/\D+/g, "");

	// 4. Validación básica (Perú)
	// Números móviles PE: 9 dígitos
	// Con código país: 51 + 9 dígitos = 11
	if (digits.length === 9) {
		return `51${digits}`;
	}

	if (digits.length === 11 && digits.startsWith("51")) {
		return digits;
	}

	throw new Error("Invalid phone number format");
}


export async function jidExists(
	session: Session | undefined,
	jid: string,
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	if (!session) {
		return { exists: false, formatJid: jid, error: "Session not found or not connected" };
	}

	const cleanInput = jid.trim();

	try {
		const resolvedType = detectJidType(cleanInput);

		// ======================
		// NUMBER
		// ======================
		if (resolvedType === "number") {
			const rawNumber = cleanInput.includes("@")
				? cleanInput.split("@")[0]
				: cleanInput;

			const normalizedNumber = normalizePhoneNumber(rawNumber);
			const formattedJid = `${normalizedNumber}@s.whatsapp.net`;

			const results = await session.onWhatsApp(formattedJid);
			const result = results?.[0];

			return {
				exists: Boolean(result?.exists),
				formatJid: formattedJid,
			};
		}

		// ======================
		// GROUP
		// ======================
		const formattedGroupJid = cleanInput.includes("@")
			? cleanInput
			: `${cleanInput}@g.us`;

		const groupMeta = await session.groupMetadata(formattedGroupJid);

		return {
			exists: Boolean(groupMeta?.id),
			formatJid: groupMeta.id,
		};
	} catch (e) {
		logger.error(e, "Error in jidExists");
		return {
			exists: false,
			formatJid: cleanInput,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}
