import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
	globalForPrisma.prisma ||
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
		datasources: {
			db: {
				url: process.env.DATABASE_URL, // Make sure this is set in your .env
			},
		},
	});
/*
// Set connection pool size and timeout
prisma.$connect().then(() => {
	// Set the connection pool size
	prisma.$executeRaw`SET max_connections = 50;`;
	// Set the connection timeout to 30 seconds
	prisma.$executeRaw`SET idle_in_transaction_session_timeout = 30000;`;
});
*/
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
