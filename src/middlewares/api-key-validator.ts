import { RequestHandler } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "@/shared";
import { sessionExists } from "@/whatsapp";

const prisma = new PrismaClient();

export const apiKeyValidator: RequestHandler = async (req, res, next) => {
	try {
		const apiKeyHeader = req.headers["x-api-key"];
		const sessionId = req.headers["x-session-id"] as string | undefined;

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
				user: {
					sessions: {
						some: {
							sessionId: sessionId,
						},
					},
				},
			},
			include: {
				user: true,
			},
		});

		if (!apiKey) {
			return res
				.status(403)
				.json({ error: "Unauthorized: Invalid API key or no access to this session" });
		}

		// Store user ID in appData for use in subsequent handlers
		if (apiKey.user) {
			req.appData.userId = apiKey.user.userId;
		}

		next();
	} catch (error) {
		logger.error("API key validation error:", error);
		return res.status(500).json({ error: "Internal server error during API key validation" });
	}
};
