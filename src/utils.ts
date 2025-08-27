import parsePhoneNumber from "libphonenumber-js";
import type { Session } from "./types";

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

function formatPhoneNumber(phoneNumber: string) {
	const defaultCountry = "PE"; // Código de país de Perú
	const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);
	if (parsedNumber) {
		return parsedNumber.number.replace("+", "");
	}
}

export async function jidExists(
	session: Session,
	jid: string,
	type: "group" | "number" = "number",
): Promise<{ exists: boolean; formatJid: string }> {
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
		return { exists: !!groupMeta.id, formatJid: jid };
	} catch (e) {
		return Promise.reject(e);
	}
}
