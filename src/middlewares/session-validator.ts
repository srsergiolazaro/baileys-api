import type { Request, Response, NextFunction } from "express";
import { sessionExists } from "@/whatsapp";

// Middleware para validar la sesión
export default function sessionValidator(req: Request, res: Response, next: NextFunction) {
	const sessionId = req.params.sessionId || req.appData?.sessionId;

	if (!sessionId) {
		return res.status(400).json({ error: "Session ID is required" });
	}

	if (req.params.sessionId && req.params.sessionId !== req.appData?.sessionId) {
		return res.status(403).json({ error: "Session ID does not match" });
	}

	if (!sessionExists(sessionId)) {
		return res.status(404).json({ error: "Session not found" });
	}

	// Inyecta el sessionId de req.appData si no está en req.params
	if (!req.params.sessionId && req.appData?.sessionId) {
		req.params.sessionId = req.appData.sessionId as string;
	}

	next();
}
