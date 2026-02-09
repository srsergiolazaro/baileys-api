import { RequestHandler } from "express";
import { prisma } from "@/db";

/**
 * Middleware that only validates the API key without checking the session
 * This is useful for routes that don't require an existing session (like session creation)
 */
export const apiKeyValidatorKeyOnly: RequestHandler = async (req, res, next) => {
	const userId = (req.headers["x-user-id"] as string) || req.query.userId || req.body.userId;

	// Initialize appData if it doesn't exist
	if (!req.appData) {
		req.appData = {} as any;
	}
	req.appData.userId = userId;

	return next();
};

const sessionCache = new Map<string, { userId: string, expires: number }>();
const SESSION_CACHE_TTL = 60 * 1000; // 1 minuto de caché

/**
 * Middleware that validates both API key and session
 * This is the original validator that requires both a valid API key and an existing session
 */
export const apiKeyValidator: RequestHandler = async (req, res, next) => {
	const sessionId =
		(req.headers["x-session-id"] as string) || req.query.sessionId || req.body.sessionId;

	if (!sessionId) {
		return res.status(400).json({ error: "Session ID is required" });
	}

	// Initialize appData if it doesn't exist
	if (!req.appData) {
		req.appData = {} as any;
	}

	// Intentar obtener de la caché
	const cached = sessionCache.get(sessionId);
	if (cached && cached.expires > Date.now()) {
		req.appData.userId = cached.userId;
		req.appData.sessionId = sessionId;
		return next();
	}

	const userSession = await prisma.userSession.findFirst({
		where: {
			sessionId: sessionId,
		},
	});

	if (!userSession) {
		return res.status(404).json({ error: `Session not found: ${sessionId}` });
	}

	// Guardar en caché
	sessionCache.set(sessionId, {
		userId: userSession.userId,
		expires: Date.now() + SESSION_CACHE_TTL
	});

	req.appData.userId = userSession.userId;
	req.appData.sessionId = sessionId;

	return next();
};
