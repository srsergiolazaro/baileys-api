import type { Request, Response, NextFunction } from "express";
import { sessionExists } from "@/whatsapp";

// La interfaz local RequestWithTokenData fue eliminada.
// Ahora confiamos en la definición global en src/@types/express.d.ts

// Middleware para validar la sesión
export default function sessionValidator(req: Request, res: Response, next: NextFunction) {
	const sessionIdFromToken = req.tokenData?.sessionId;
	const sessionIdFromAppData = req.appData?.sessionId;

	const sessionId = sessionIdFromToken || sessionIdFromAppData;

	if (!sessionId) {
		return res
			.status(400)
			.json({ error: "Session ID is required and not found in token or appData" });
	}

	if (!sessionExists(sessionId)) {
		return res.status(404).json({ error: `Session not found for ID: ${sessionId}` });
	}

	next();
}
