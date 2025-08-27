import { Request, Response, NextFunction } from "express";
import { prisma } from "@/db";

export const userSessionValidator = async (req: Request, res: Response, next: NextFunction) => {
	const userId = req.body.userId || req.query.userId;

	if (!userId) {
		return res.status(400).json({ error: "userId is required" });
	}

	try {
		const userSession = await prisma.userSession.findUnique({
			where: {
				userId: userId as string,
			},
		});

		if (!userSession) {
			return res.status(404).json({ error: `UserSession with ID ${userId} not found` });
		}

		next();
	} catch (error) {
		console.error("Error validating user session:", error);
		res.status(500).json({ error: "Internal server error during user session validation" });
	}
};
