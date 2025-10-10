import type { RequestHandler } from "express";
import { prisma } from "@/db";
import { logger } from "@/shared";
import {
	createSession,
	deleteSession,
	getSession,
	getSessionStatus,
	listSessions,
	sessionExists,
} from "@/whatsapp";

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
		const session = getSession(req.appData.sessionId);
		if (!session) {
			return res.status(404).json({ error: "Sesión no encontrada" });
		}
		const currentStatus = getSessionStatus(session);
		res.status(200).json({
			status: currentStatus,
			sessionId: req.appData.sessionId,
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
		// Create or update UserSession
		await prisma.userSession.upsert({
			where: { sessionId },
			update: {
				status: "active",
				deviceName: deviceName || "WhatsApp User",
				lastActive: new Date(),
				updatedAt: new Date(),
			},
			create: {
				id: sessionId, // Add required id field
				userId,
				sessionId,
				status: "active",
				deviceName: deviceName || "WhatsApp User",
				phoneNumber: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				lastActive: new Date(),
			},
		});

		// Create the WhatsApp session
		await createSession({
			userId,
			res,
			readIncomingMessages,
			socketConfig,
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
	createSession({ userId, res, SSE: true });
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
