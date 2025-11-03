import parsePhoneNumber from "libphonenumber-js";
import { jidNormalizedUser } from "baileys";
import type { Session } from "./types";
import { logger } from "./shared";

// (Asegúrate de que estas funciones auxiliares estén disponibles)
// export const serializePrisma = ...
// export function delay(...)

/**
 * Formatea un número de teléfono a un formato E.164 sin el símbolo '+'.
 * Utiliza un código de país por defecto si no se proporciona.
 * @param phoneNumber - El número de teléfono a formatear.
 */
function formatPhoneNumber(phoneNumber: string): string {
	const defaultCountry = "PE"; // Código de país de Perú
	const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);
	if (!parsedNumber) {
		throw new Error(`Invalid phone number format: ${phoneNumber}`);
	}
	// Devuelve el número en formato E.164 sin el '+' (ej: 51912519452)
	return parsedNumber.number.substring(1);
}

/**
 * Verifica de forma inteligente si un JID (de usuario o grupo) existe en WhatsApp.
 * Determina automáticamente el tipo de JID basándose en su formato.
 *
 * @param session - La sesión activa de Baileys.
 * @param jid - El JID a verificar. Puede ser un número ('519...'), un JID de usuario ('...@s.whatsapp.net'), o un JID de grupo ('...@g.us').
 * @returns Un objeto indicando si existe y el JID formateado correctamente.
 */
export async function jidExists(
	session: Session | undefined,
	jid: string,
): Promise<{ exists: boolean; formatJid: string; error?: string }> {
	if (!session) {
		return { exists: false, formatJid: jid, error: "Session not found or not connected" };
	}

	const trimmedJid = jid.trim();

	try {
		// 1. Detección de Grupo: Los JIDs de grupo son los únicos que terminan en @g.us
		if (trimmedJid.endsWith("@g.us")) {
			const groupMeta = await session.groupMetadata(trimmedJid);
			// Si groupMetadata no lanza un error, el grupo existe.
			return { exists: !!groupMeta.id, formatJid: groupMeta.id };
		}

		// 2. Detección de Usuario: Todo lo demás se trata como un posible usuario.
		// Esto incluye números simples, JIDs con @s.whatsapp.net y LIDs con @lid.
		let userJid: string;
		if (trimmedJid.includes("@")) {
			userJid = jidNormalizedUser(trimmedJid);
		} else {
			// Si es un número simple, lo formateamos.
			const formattedNumber = formatPhoneNumber(trimmedJid);
			userJid = `${formattedNumber}@s.whatsapp.net`;
		}

		// Para usuarios, verificamos su existencia con onWhatsApp.
		// Esto funciona para JIDs normales y también resuelve LIDs internamente si es necesario.
		const results = await session.onWhatsApp(userJid);
		const result = results?.[0];

		if (result?.exists) {
			// Importante: Devolvemos el JID que verificamos (ej: 51...@s.whatsapp.net)
			// para asegurar la compatibilidad con funciones como groupCreate.
			return { exists: true, formatJid: result.jid };
		} else {
			return { exists: false, formatJid: userJid };
		}
	} catch (e) {
		// El error puede ocurrir si groupMetadata falla para un JID de grupo inválido,
		// o si el formato del número es incorrecto.
		logger.error(e, `Error checking JID existence for: ${trimmedJid}`);
		return {
			exists: false,
			formatJid: trimmedJid,
			error: e instanceof Error ? e.message : "Unknown error during JID check",
		};
	}
}
