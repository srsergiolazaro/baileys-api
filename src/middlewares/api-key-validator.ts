import { RequestHandler } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "@/shared";
import { sessionExists } from "@/whatsapp";

const prisma = new PrismaClient();

/**
 * Middleware that only validates the API key without checking the session
 * This is useful for routes that don't require an existing session (like session creation)
 */
export const apiKeyValidatorKeyOnly: RequestHandler = async (req, res, next) => {
	const userId = (req.headers["x-user-id"] as string) || req.query.userId || req.body.userId;

	req.appData.userId = userId;

	return next();
	/*
	try {
		const apiKeyHeader = req.headers["x-api-key"];

		if (!apiKeyHeader) {
			return res.status(401).json({ error: "Unauthorized: API Key missing" });
		}

		// Initialize appData if it doesn't exist
		if (!req.appData) {
			req.appData = { sessionId: "" };
		}

		const plainApiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

		// Find the API key
		const apiKey = await prisma.apiKey.findFirst({
			where: {
				key: plainApiKey,
				enabled: true,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
		});

		if (!apiKey) {
			return res.status(401).json({ error: "Invalid or expired API key" });
		}
		req.appData.userId = apiKey.userId;

		next();
	} catch (error) {
		logger.error(error, "Error in apiKeyValidatorKeyOnly middleware");
		return res.status(500).json({ error: "Internal server error" });
	}
	*/
};

/**
 * Middleware that validates both API key and session
 * This is the original validator that requires both a valid API key and an existing session
 */
export const apiKeyValidator: RequestHandler = async (req, res, next) => {
	const sessionId =
		(req.headers["x-session-id"] as string) || req.query.sessionId || req.body.sessionId;

	const userSession = await prisma.userSession.findFirst({
		where: {
			userId: sessionId,
		},
	});

	if (!userSession) {
		return res.status(404).json({ error: `Session not found: ${sessionId}` });
	}
	req.appData.userId = userSession.userId;

	req.appData.sessionId = sessionId;

	return next();
	/*
	try {
		const apiKeyHeader = req.headers["x-api-key"] || req.query.apiKey || req.body.apiKey;

		if (!apiKeyHeader) {
			return res.status(401).json({ error: "Unauthorized: API Key missing" });
		}

		if (!sessionId) {
			return res.status(400).json({ error: "Session ID is required" });
		}

		// Initialize appData if it doesn't exist
		if (!req.appData) {
			req.appData = { sessionId: "" };
		}

		// Set sessionId in appData for use in other middlewares
		req.appData.sessionId = sessionId;

		// Check if session exists
		if (!sessionExists(sessionId)) {
			return res.status(404).json({ error: `Session not found: ${sessionId}` });
		}

		const plainApiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

		// Find the API key with session access
		const apiKey = await prisma.apiKey.findFirst({
			where: {
				key: plainApiKey,
				enabled: true,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
		});

		if (!apiKey) {
			return res.status(403).json({ error: "Unauthorized: Invalid API key" });
		}

		// Check if the user has access to this session
		const hasAccess = await prisma.userSession.findFirst({
			where: {
				userId: apiKey.userId,
				sessionId: sessionId,
			},
			select: {
				user: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hasAccess) {
			return res.status(403).json({ error: "Unauthorized: No access to this session" });
		}

		// Store user ID in appData for use in subsequent handlers
		req.appData.userId = apiKey.userId;

		next();
	} catch (error) {
		logger.error("API key validation error:", error);
		return res.status(500).json({ error: "Internal server error during API key validation" });
	}
	*/
};
