import { prisma } from "../db";
import { logger } from "../shared";
import type { Session } from "../types";

const sessions = new Map<string, Session>();

export function getSessionStatus(session: Session) {
	const state = ["CONNECTING", "CONNECTED", "DISCONNECTING", "DISCONNECTED"];
	let status = state[(session.ws as any).readyState];
	status = session.user ? "AUTHENTICATED" : status;
	return status;
}

export function listSessions(): { id: string; status: string }[] {
	return Array.from(sessions.entries()).map(([id, session]) => ({
		id,
		status: getSessionStatus(session),
	}));
}

export function getSession(sessionId: string): Session | undefined {
	return sessions.get(sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
	const session = sessions.get(sessionId);
	if (session) {
		await session.destroy();
	} else {
		// Si la sesión no está activa en memoria, eliminar datos de la base de datos
		try {
			await Promise.allSettled([
				prisma.chat.deleteMany({ where: { sessionId } }),
				prisma.contact.deleteMany({ where: { sessionId } }),
				prisma.message.deleteMany({ where: { sessionId } }),
				prisma.groupMetadata.deleteMany({ where: { sessionId } }),
				prisma.userSession.delete({ where: { sessionId } }),
				prisma.webhook.deleteMany({ where: { sessionId } }),
			]);
			logger.info({ sessionId }, "Session data deleted from database");
		} catch (e) {
			logger.error(e, "An error occurred during session data cleanup");
		}
	}
}

export function sessionExists(sessionId: string): boolean {
	return sessions.has(sessionId);
}

export const sessionsMap = sessions;
