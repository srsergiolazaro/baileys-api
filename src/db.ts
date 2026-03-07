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
