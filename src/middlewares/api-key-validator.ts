import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";

dotenv.config();

const apiKey = process.env.API_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!apiKey || !jwtSecret) {
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
	if (apiKeyValue !== apiKey) {
		console.warn("Invalid API key provided");
		return res.status(403).json({ error: "Invalid API key provided" });
	}

	jwt.verify(apiKeyValue.toString(), jwtSecret!, (err, decoded) => {
		if (err) {
			console.error("Unauthorized: Invalid or expired API key", err);
			return res.status(401).json({ error: "Unauthorized: Invalid or expired API key" });
		}
		req.appData = decoded as jwt.JwtPayload;
		next();
	});
}

export function apiKeyValidator(req: Request, res: Response, next: NextFunction) {
	const headerApiKey = req.headers["x-api-key"];
	verifyApiKeyAndJwt(headerApiKey as string | undefined, req, res, next);
}

export function apiKeyValidatorParam(req: Request, res: Response, next: NextFunction) {
	const paramApiKey = req.query["api_key"] || req.query["API_KEY"];
	verifyApiKeyAndJwt(paramApiKey as string | undefined, req, res, next);
}
