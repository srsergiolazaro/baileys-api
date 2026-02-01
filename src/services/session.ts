import { prisma } from "../db";
import { logger } from "../shared";
import type { Session } from "../types";

const sessions = new Map<string, Session>();

// Lock para prevenir reinicios simultáneos de la misma sesión
const restartingLocks = new Set<string>();

export function isRestarting(sessionId: string): boolean {
	return restartingLocks.has(sessionId);
}

export function setRestartingLock(sessionId: string): boolean {
	if (restartingLocks.has(sessionId)) {
		return false; // Ya está reiniciando
	}
	restartingLocks.add(sessionId);
	return true;
}

export function clearRestartingLock(sessionId: string): void {
	restartingLocks.delete(sessionId);
}

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

/**
 * Detiene la sesión de forma suave SIN hacer logout.
 * Esto preserva las credenciales para poder reconectar.
 * @returns true si se detuvo correctamente, false si no existía
 */
export async function stopSession(sessionId: string): Promise<boolean> {
	const session = sessions.get(sessionId);
	if (!session) {
		logger.info({ sessionId }, "stopSession: session not found in memory");
		return false;
	}

	try {
		// Cerrar el websocket sin hacer logout
		session.ws.close();
		logger.info({ sessionId }, "stopSession: websocket closed");
	} catch (e) {
		logger.error({ sessionId, error: e }, "stopSession: error closing websocket");
	}

	// Marcar como inactiva en BD
	try {
		await prisma.userSession.update({
			where: { sessionId },
			data: { status: "inactive" },
		});
	} catch (e) {
		logger.warn({ sessionId, error: e }, "stopSession: error updating status in DB");
	}

	// Remover de memoria
	sessions.delete(sessionId);
	logger.info({ sessionId }, "stopSession: session removed from memory");

	return true;
}

export function sessionExists(sessionId: string): boolean {
	return sessions.has(sessionId);
}

export const sessionsMap = sessions;
