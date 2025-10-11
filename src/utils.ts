import parsePhoneNumber from "libphonenumber-js";
import { jidNormalizedUser } from "baileys";
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
		const formatJid = (value: string) =>
			value.includes("@") ? value : `${formatPhoneNumber(value)}@s.whatsapp.net`;
		const trimmedJid = jid.trim();

		if (trimmedJid.endsWith("@lid")) {
			try {
				const pnForLid = await session.signalRepository?.lidMapping.getPNForLID(trimmedJid);
				if (pnForLid) {
					const normalizedPn = jidNormalizedUser(pnForLid);
					if (normalizedPn) {
						const validationResults = await session.onWhatsApp(normalizedPn);
						const validation = validationResults?.[0];
						if (!validation?.exists) {
							return { exists: false, formatJid: trimmedJid };
						}
					}
				}
			} catch (error) {
				logger.warn(
					{ err: error, lid: trimmedJid },
					"Failed to verify PN mapping for LID; continuing with LID",
				);
			}
			return { exists: true, formatJid: trimmedJid };
		}

		if (type === "number") {
			const formattedPnJid = formatJid(trimmedJid);
			const normalizedPnJid = jidNormalizedUser(formattedPnJid) || formattedPnJid;
			const results = await session.onWhatsApp(normalizedPnJid);
			const result = results?.[0];
			if (!result?.exists) {
				return { exists: false, formatJid: formattedPnJid };
			}

			let targetJid = formattedPnJid;
			try {
				const lid = await session.signalRepository?.lidMapping.getLIDForPN(normalizedPnJid);
				if (lid) {
					targetJid = lid;
				}
			} catch (error) {
				logger.warn(
					{ err: error, formattedPnJid },
					"Failed to resolve LID mapping for phone number; falling back to PN",
				);
			}

			return { exists: true, formatJid: targetJid };
		}

		const groupMeta = await session.groupMetadata(jid);
		return { exists: !!groupMeta.id, formatJid: groupMeta.id };
	} catch (e) {
		logger.error(e, "Error in jidExists");
		return { exists: false, formatJid: jid, error: e instanceof Error ? e.message : "Unknown error" };
	}
}

