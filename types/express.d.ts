/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { JwtPayload } from "jsonwebtoken";

interface Payload {
	sessionId: string;
}

declare global {
	namespace Express {
		interface Request {
			appData?: any;
		}
	}
}
