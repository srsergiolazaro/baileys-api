import type { RequestHandler } from "express";
import { logger } from "@/shared";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const generateApiKey = (appData: object) => {
	const secretOrPrivateKey: jwt.Secret = process.env.JWT_SECRET || "";
	return jwt.sign(appData, secretOrPrivateKey);
};
export const create: RequestHandler = async (req, res) => {
	try {
		const appData = { sessionId: req.body.sessionId };

		const apiKey = generateApiKey(appData);

		res.status(200).json({ apiKey });
	} catch (e) {
		const message = "An error occurred while generating API key";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
