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

process.on("SIGTERM", async () => {
	await prisma.$disconnect();
	process.exit(0);
});

process.on("SIGINT", async () => {
	await prisma.$disconnect();
	process.exit(0);
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
