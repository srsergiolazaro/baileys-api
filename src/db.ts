import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
	return new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
	});
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
	console.log(`${signal} received, shutting down gracefully...`);
	await prisma.$disconnect();
	process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
