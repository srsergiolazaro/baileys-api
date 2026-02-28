import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Configurar WebSocket para el driver serverless
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
	const connectionString = process.env.DATABASE_URL!;

	// Adapter serverless: conexiones se abren y cierran por demanda
	const adapter = new PrismaNeon({ connectionString });

	return new PrismaClient({
		// @ts-ignore driverAdapters es un previewFeature
		adapter,
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
	});
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

// Graceful shutdown with session cache flush
const gracefulShutdown = async (signal: string) => {
	console.log(`${signal} received, shutting down gracefully...`);
	try {
		// Dynamic import to avoid circular dependency
		const { flushAllSessions } = await import('./store/session');
		await flushAllSessions();
	} catch (e) {
		console.error('Error flushing sessions:', e);
	}
	await prisma.$disconnect();
	process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
