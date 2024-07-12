import type { Request, Response, NextFunction } from "express";
import { sessionExists } from "@/whatsapp";

// Middleware para validar la sesión
export default function sessionValidator(req: Request, res: Response, next: NextFunction) {
	const sessionId = req.appData.sessionId;

	if (!sessionId) {
		return res.status(400).json({ error: "Session ID is required" });
	}

	if (!sessionExists(sessionId)) {
		return res.status(404).json({ error: "Session not found" });
	}

	next();
}
