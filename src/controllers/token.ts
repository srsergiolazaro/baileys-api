import type { RequestHandler, Request } from "express";
import { logger } from "@/shared";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const generateJwtToken = (appData: object) => {
	const secretOrPrivateKey: jwt.Secret = process.env.JWT_SECRET || "some-default-secret";
	return jwt.sign(appData, secretOrPrivateKey, { expiresIn: '1h' });
};
export const create: RequestHandler = async (req: Request & { user?: { id?: string } }, res) => {
	try {
		const userId = req.user?.id;
		const sessionId = req.body.sessionId;

		if (!sessionId) {
			return res.status(400).json({ error: "sessionId is required to generate a token" });
		}

		const tokenPayload: { sessionId: string; userId?: string } = { sessionId };
		if (userId) {
			tokenPayload.userId = userId;
		}

		const token = generateJwtToken(tokenPayload);

		res.status(200).json({ token });
	} catch (e) {
		const message = "An error occurred while generating token";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};
