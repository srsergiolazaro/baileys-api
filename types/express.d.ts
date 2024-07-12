import type { JwtPayload } from "jsonwebtoken";

interface Payload {
	sessionId: string;
}

declare global {
	namespace Express {
		interface Request {
			appData?: JwtPayload | Payload;
		}
	}
}
