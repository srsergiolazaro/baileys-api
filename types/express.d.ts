import type { JwtPayload } from "jsonwebtoken";

declare module "express-serve-static-core" {
	interface Request {
		appData?: JwtPayload | string;
	}
}
