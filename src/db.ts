import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

console.log('📦 DB: Initializing Prisma module...');

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
	const client = new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
	});

	return client;
}

const prismaInstance = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prismaInstance;
}

export const prisma = prismaInstance;

// Auto-connect and log status with retry
async function connectWithRetry(retries = 5, delay = 2000) {
	for (let i = 0; i < retries; i++) {
		try {
			await prisma.$connect();
			console.log('✅ DB: Prisma Client connected successfully');
			return;
		} catch (err) {
			console.error(`❌ DB: Prisma Client failed to connect (attempt ${i + 1}/${retries})`, err);
			if (i < retries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
	console.error('🔥 DB: Prisma Client could not connect after several attempts');
}

connectWithRetry();

export async function withPrismaRetry<T>(
	operation: () => Promise<T>,
	retries = 3,
	delay = 1000,
	operationName = 'operation',
): Promise<T> {
	let lastError: any;
	for (let i = 0; i < retries; i++) {
		try {
			return await operation();
		} catch (err: any) {
			lastError = err;
			const isTransient =
				err.code === 'P1017' || // Server has closed the connection
				err.code === 'P2021' || // Table does not exist (sometimes transient on startup)
				err.message?.includes('closed') ||
				err.message?.includes('timeout');

			if (isTransient && i < retries - 1) {
				console.warn(
					`⚠️ DB: Transient error in ${operationName} (attempt ${i + 1}/${retries}), retrying...`,
					{ code: err.code, message: err.message },
				);
				await new Promise((resolve) => setTimeout(resolve, delay * (i + 1))); // Exponential-ish backoff
				continue;
			}
			throw err;
		}
	}
	throw lastError;
}
