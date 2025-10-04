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

export async function jidExists(
	session: Session | undefined,
	jid: string,
	type: "group" | "number" = "number",
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	if (!session) {
		return { exists: false, formatJid: jid, error: "Session not found or not connected" };
	}

	try {
		const formatJid = (jid: string) =>
			jid.includes("@") ? jid : `${formatPhoneNumber(jid)}@s.whatsapp.net`;

		if (type === "number") {
			const formattedJid = formatJid(jid);
			const results = await session.onWhatsApp(formattedJid);
			const result = results?.[0];
			return { exists: !!result?.exists, formatJid: formattedJid };
		}

		const groupMeta = await session.groupMetadata(jid);
		return { exists: !!groupMeta.id, formatJid: groupMeta.id };
	} catch (e) {
		logger.error(e, "Error in jidExists");
		return { exists: false, formatJid: jid, error: e instanceof Error ? e.message : "Unknown error" };
	}
}
