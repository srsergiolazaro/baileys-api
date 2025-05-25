import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
	throw new Error("API key or JWT secret is not set in the environment variables");
}

function verifyApiKeyAndJwt(
	apiKeyValue: string | string[] | undefined,
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (!apiKeyValue) {
		console.warn("API key is missing");
		return res.status(403).json({ error: "API key is missing" });
	}
	if (Array.isArray(apiKeyValue)) {
		console.warn("Invalid API key format");
		return res.status(403).json({ error: "Invalid API key format" });
	}

	jwt.verify(apiKeyValue.toString(), jwtSecret!, (err, decoded) => {
		if (err) {
			console.error("Unauthorized: Invalid or expired API key", err);
			return res.status(401).json({ error: "Unauthorized: Invalid or expired API key" });
		}

		// Verificar que el payload tenga la estructura esperada
		const payload = decoded as jwt.JwtPayload;
		if (!payload || typeof payload !== "object" || !payload.sessionId) {
			return res.status(401).json({ error: "Invalid token payload" });
		}

		req.appData = {
			sessionId: payload.sessionId as string,
			jid: payload.jid as string | undefined
		};
		next();
	});
}

export function apiKeyValidatorParam(req: Request, res: Response, next: NextFunction) {
	const paramApiKey = req.query["api_key"] || req.query["API_KEY"];
	verifyApiKeyAndJwt(paramApiKey as string | undefined, req, res, next);
}
