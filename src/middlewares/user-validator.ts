import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@/db';

export const userValidator = async (req: Request, res: Response, next: NextFunction) => {
	const userId = req.body.userId || req.query.userId;

	if (!userId) {
		return res.status(400).json({ error: 'userId is required' });
	}

	try {
		const user = await prisma.user.findUnique({
			where: {
				id: userId as string,
			},
		});

		if (!user) {
			return res.status(404).json({ error: `User with ID ${userId} not found` });
		}

		next();
	} catch (error) {
		console.error('Error validating user:', error);
		res.status(500).json({ error: 'Internal server error during user validation' });
	}
};
