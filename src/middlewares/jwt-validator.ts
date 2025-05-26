import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "@/shared";
import dotenv from "dotenv";

dotenv.config();

// Ya no necesitamos AppData ni DecodedTokenData aquí si tokenData está en global
// interface DecodedTokenData {
// sessionId: string;
// userId?: string;
// }

// Ya no necesitamos AuthenticatedRequest aquí si tokenData está en global
// interface AuthenticatedRequest extends Request {
// tokenData?: DecodedTokenData;
// }

export default function jwtValidator(req: Request, res: Response, next: NextFunction) {
	// Usamos Request directamente
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return res.status(401).json({ error: "Unauthorized: Token not provided or malformed" });
	}

	const token = authHeader.split(" ")[1];
	const secretOrPrivateKey: jwt.Secret = process.env.JWT_SECRET || "some-default-secret";

	try {
		// Aseguramos que el payload del token tenga sessionId y opcionalmente userId
		const decoded = jwt.verify(token, secretOrPrivateKey) as { sessionId: string; userId?: string };

		if (!decoded.sessionId) {
			return res.status(400).json({ error: "Token is valid but missing mandatory sessionId" });
		}

		// Asignamos directamente a req.tokenData, que ahora es parte de la Request global
		req.tokenData = {
			sessionId: decoded.sessionId,
			userId: decoded.userId,
		};

		// También poblamos req.appData.userId si existe en el token, para consistencia
		// y porque appData.sessionId ya es manejado por la definición global.
		// La definición global espera que appData exista.
		if (!req.appData) {
			// Esto no debería ocurrir si otros middlewares o la inicialización de express lo hacen.
			// La definicion global actual implica que appData siempre existe y tiene sessionId: string
			// Por seguridad, si llegamos aquí y appData no existe, podría ser un problema de configuración
			// pero para este middleware, nos enfocaremos en poblar tokenData y opcionalmente appData.userId
			req.appData = { sessionId: decoded.sessionId }; // Cumple con el mínimo de la definicion global
		}
		if (decoded.userId) {
			req.appData.userId = decoded.userId;
		}

		next();
	} catch (error) {
		logger.error(error, "JWT validation error");
		if (error instanceof jwt.TokenExpiredError) {
			return res.status(401).json({ error: "Unauthorized: Token expired" });
		}
		if (error instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({ error: "Unauthorized: Invalid token" });
		}
		return res.status(500).json({ error: "Internal server error during token validation" });
	}
}
