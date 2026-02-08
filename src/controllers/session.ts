import type { RequestHandler } from "express";
import { prisma } from "@/db";
import { logger } from "@/shared";
import {
	deleteSession,
	getSession,
	getSessionStatus,
	listSessions,
	sessionExists,
	stopSession,
	isRestarting,
	setRestartingLock,
	clearRestartingLock,
} from "@/whatsapp";
import { createSession } from "@/services/baileys";

export const list: RequestHandler = (req, res) => {
	res.status(200).json(listSessions());
};

export const getUserSessions: RequestHandler = async (req, res) => {
	try {
		const userId = req.appData.userId;
		if (!userId) {
			return res.status(401).json({ error: "No se pudo identificar al usuario" });
		}

		const userSessions = await prisma.userSession.findMany({
			where: { userId },
			orderBy: { lastActive: "desc" },
			select: {
				id: true,
				sessionId: true,
				status: true,
				phoneNumber: true,
				deviceName: true,
				lastActive: true,
			},
		});

		const activeSessions = listSessions();
		const activeSessionMap = new Map(activeSessions.map((s) => [s.id, s]));

		const result = userSessions.map((session) => ({
			...session,
			isConnected: activeSessionMap.has(session.sessionId),
			connectionStatus: activeSessionMap.get(session.sessionId)?.status || "DISCONNECTED",
		}));

		res.status(200).json(result);
	} catch (error) {
		logger.error("Error getting user sessions:", error);
		res.status(500).json({ error: "Error al obtener las sesiones" });
	}
};

export const find: RequestHandler = (req, res) =>
	res.status(200).json({ message: "Session found" });

export const status: RequestHandler = (req, res) => {
	try {
		const sessionId =
			req.appData?.sessionId ||
			(req.headers["x-session-id"] as string) ||
			(req.query.sessionId as string);

		if (!sessionId) {
			return res.status(400).json({ error: "Session ID es requerido" });
		}

		const session = getSession(sessionId);
		if (!session) {
			return res.status(404).json({ error: "Sesión no encontrada" });
		}
		const currentStatus = getSessionStatus(session);
		res.status(200).json({
			status: currentStatus,
			sessionId: sessionId,
			isConnected: currentStatus === "CONNECTED" || currentStatus === "CONNECTING",
		});
	} catch (error) {
		logger.error("Error al obtener el estado de la sesión:", error);
		res.status(500).json({
			error: "Error al obtener el estado de la sesión",
			details: error instanceof Error ? error.message : "Error desconocido",
		});
	}
};

export const add: RequestHandler = async (req, res) => {
	// First get the userId from the authenticated user
	const userId = req.appData.userId;
	if (!userId) {
		return res.status(401).json({ error: "User not authenticated" });
	}

	const { sessionId, readIncomingMessages, deviceName, ...socketConfig } = req.body;

	if (sessionExists(sessionId)) {
		return res.status(400).json({ error: "Session already exists" });
	}

	try {
		// Create the WhatsApp session
		// UserSession will be created/updated inside createSession only when connection is 'open'
		await createSession({
			userId,
			sessionId,
			res,
			readIncomingMessages,
			socketConfig,
			deviceName,
		});
	} catch (error) {
		logger.error("Error creating session:", error);
		res.status(500).json({
			error: "Failed to create session",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

export const addSSE: RequestHandler = async (req, res) => {
	const appData = req.appData;

	const userId = appData.userId;

	if (!userId) {
		return;
	}
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	const sessionId = (req.query.sessionId as string) || undefined;
	createSession({ userId, res, SSE: true, sessionId });
};

export const del: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.body;
		if (!sessionId) {
			return res.status(400).json({ error: "Se requiere el ID de la sesión" });
		}

		const appData = req.appData;

		const userId = appData.userId;

		if (userId) {
			await prisma.userSession.updateMany({
				where: {
					userId,
					sessionId,
				},
				data: {
					status: "inactive",
					updatedAt: new Date(),
				},
			});
		}

		await deleteSession(sessionId);
		res.status(200).json({
			success: true,
			message: "Sesión eliminada correctamente",
		});
	} catch (error) {
		logger.error("Error al eliminar la sesión:", error);
		res.status(500).json({
			error: "Error al eliminar la sesión",
			details: error instanceof Error ? error.message : "Error desconocido",
		});
	}
};

/**
 * Reinicia una sesión de WhatsApp de forma segura.
 *
 * IMPORTANTE: Este endpoint tiene protecciones contra conexiones duplicadas:
 * 1. Lock de reinicio - previene múltiples reinicios simultáneos
 * 2. Cierre suave - desconecta sin hacer logout (preserva credenciales)
 * 3. Espera de desconexión - asegura cierre completo antes de reconectar
 * 4. Verificación - confirma que no hay sesión activa antes de crear nueva
 */
export const restart: RequestHandler = async (req, res) => {
	const sessionId = req.appData?.sessionId || req.body?.sessionId;
	const userId = req.appData?.userId;

	if (!sessionId) {
		return res.status(400).json({ error: "Se requiere el ID de la sesión" });
	}

	if (!userId) {
		return res.status(401).json({ error: "Usuario no autenticado" });
	}

	// Verificar que la sesión pertenece al usuario
	const userSession = await prisma.userSession.findFirst({
		where: { sessionId, userId },
	});

	if (!userSession) {
		return res.status(404).json({ error: "Sesión no encontrada para este usuario" });
	}

	// ============================================================
	// 🔒 LOCK: Prevenir reinicios simultáneos
	// ============================================================
	if (isRestarting(sessionId)) {
		logger.warn({ sessionId }, "restart: sesión ya está reiniciando");
		return res.status(409).json({
			error: "La sesión ya está en proceso de reinicio",
			code: "RESTART_IN_PROGRESS"
		});
	}

	if (!setRestartingLock(sessionId)) {
		logger.warn({ sessionId }, "restart: no se pudo obtener lock");
		return res.status(409).json({
			error: "La sesión ya está en proceso de reinicio",
			code: "RESTART_IN_PROGRESS"
		});
	}

	logger.info({ sessionId, userId }, "restart: iniciando reinicio de sesión");

	try {
		// ============================================================
		// 🛑 PASO 1: Detener sesión actual (sin logout)
		// ============================================================
		const wasActive = sessionExists(sessionId);

		if (wasActive) {
			logger.info({ sessionId }, "restart: deteniendo sesión activa");
			await stopSession(sessionId);

			// Esperar a que se cierre completamente
			// Baileys necesita tiempo para limpiar recursos
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Verificación de seguridad: asegurarse de que ya no existe
			if (sessionExists(sessionId)) {
				logger.error({ sessionId }, "restart: sesión aún existe después de stopSession");
				clearRestartingLock(sessionId);
				return res.status(500).json({
					error: "No se pudo detener la sesión correctamente",
					code: "STOP_FAILED"
				});
			}
		} else {
			logger.info({ sessionId }, "restart: sesión no estaba activa en memoria");
		}

		// ============================================================
		// 🔄 PASO 2: Obtener configuración guardada
		// ============================================================
		let readIncomingMessages = false;
		let deviceName = userSession.deviceName || "WhatsApp User";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let socketConfig: any = undefined;

		if (userSession.data) {
			try {
				const parsedData = JSON.parse(userSession.data);
				readIncomingMessages = parsedData.readIncomingMessages || false;
				const { readIncomingMessages: _, ...rest } = parsedData;
				if (Object.keys(rest).length > 0) {
					socketConfig = rest;
				}
			} catch (e) {
				logger.warn({ sessionId }, "restart: no se pudo parsear data de sesión");
			}
		}

		// ============================================================
		// 🚀 PASO 3: Crear nueva sesión
		// ============================================================
		logger.info({ sessionId }, "restart: creando nueva conexión");

		await createSession({
			sessionId,
			userId,
			readIncomingMessages,
			deviceName,
			...(socketConfig && { socketConfig }),
		});

		// Esperar un momento para que la conexión se establezca
		await new Promise(resolve => setTimeout(resolve, 1000));

		logger.info({ sessionId }, "restart: reinicio completado exitosamente");

		res.status(200).json({
			success: true,
			message: "Sesión reiniciada correctamente",
			sessionId,
		});

	} catch (error) {
		logger.error({ sessionId, error }, "restart: error durante el reinicio");
		res.status(500).json({
			error: "Error al reiniciar la sesión",
			details: error instanceof Error ? error.message : "Error desconocido",
		});
	} finally {
		// ============================================================
		// 🔓 SIEMPRE liberar el lock
		// ============================================================
		clearRestartingLock(sessionId);
		logger.info({ sessionId }, "restart: lock liberado");
	}
};
