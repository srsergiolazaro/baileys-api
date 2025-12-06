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

function formatPhoneNumber(phoneNumber: string): string {
	const defaultCountry = "PE"; // Código de país de Perú
	const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);
	if (!parsedNumber) {
		throw new Error("Invalid phone number format");
	}
	return parsedNumber.number.replace("+", "");
}

const detectJidType = (jid: string): "group" | "number" => {
	const normalized = jid.toLowerCase();
	if (normalized.includes("@g.us")) return "group";
	if (normalized.includes("@s.whatsapp.net")) return "number";
	return "number";
};

export async function jidExists(
	session: Session | undefined,
	jid: string,
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	if (!session) {
		return { exists: false, formatJid: jid, error: "Session not found or not connected" };
	}

	try {
		const resolvedType = detectJidType(jid);
		const formatNumberJid = (jid: string) =>
			jid.includes("@") ? jid : `${formatPhoneNumber(jid)}@s.whatsapp.net`;
		const formatGroupJid = (jid: string) => (jid.includes("@") ? jid : `${jid}@g.us`);

		if (resolvedType === "number") {
			const formattedJid = formatNumberJid(jid);
			const results = await session.onWhatsApp(formattedJid);
			const result = results?.[0];
			return { exists: !!result?.exists, formatJid: formattedJid };
		}

		const formattedGroupJid = formatGroupJid(jid);
		const groupMeta = await session.groupMetadata(formattedGroupJid);
		return { exists: !!groupMeta.id, formatJid: groupMeta.id };
	} catch (e) {
		logger.error(e, "Error in jidExists");
		return { exists: false, formatJid: jid, error: e instanceof Error ? e.message : "Unknown error" };
	}
}
