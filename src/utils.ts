import parsePhoneNumber from "libphonenumber-js";
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


function sanitizeInput(value: string): string {
	return value.trim().replace(/\s+/g, "");
}

function sanitizePhoneNumber(value: string): string {
	// deja SOLO dígitos
	return value.replace(/\D+/g, "");
}

function formatPhoneNumber(phoneNumber: string): string {
	const defaultCountry = "PE"; // Perú
	const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);

	if (!parsedNumber || !parsedNumber.isValid()) {
		throw new Error("Invalid phone number format");
	}

	// E.164 sin "+"
	return parsedNumber.number.replace("+", "");
}

const detectJidType = (jid: string): "group" | "number" => {
	const normalized = jid.toLowerCase();
	if (normalized.endsWith("@g.us")) return "group";
	if (normalized.endsWith("@s.whatsapp.net")) return "number";
	return "number";
};

export async function jidExists(
	session: Session | undefined,
	jid: string,
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	if (!session) {
		return { exists: false, formatJid: jid, error: "Session not found or not connected" };
	}

	const cleanInput = sanitizeInput(jid);

	try {
		const resolvedType = detectJidType(cleanInput);

		// ======================
		// NUMBER
		// ======================
		if (resolvedType === "number") {
			// Si ya viene como JID, no tocar el número
			const rawNumber = cleanInput.includes("@")
				? cleanInput.split("@")[0]
				: sanitizePhoneNumber(cleanInput);

			const formattedNumber = formatPhoneNumber(rawNumber);
			const formattedJid = `${formattedNumber}@s.whatsapp.net`;

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
