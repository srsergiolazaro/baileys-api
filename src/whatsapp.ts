import { prisma } from "./db";
import { createSession } from "./services/baileys";
import { logger } from "./shared";
export { jidExists } from "./utils";
export {
    getSessionStatus,
    listSessions,
    getSession,
    deleteSession,
    sessionExists,
} from "./services/session";

export async function init(workerId?: number, totalWorkers?: number) {
    const userSessions = await prisma.userSession.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { status: "active" },
    });
    logger.info("init: loaded UserSession records", { count: userSessions.length, workerId });

    const processedUsers = new Set<string>();
    for (const { sessionId, data, userId } of userSessions) {
        // Skip if no session config data
        if (!data) {
            logger.warn("init: skipping session due to missing data", { sessionId, userId });
            continue;
        }

        // Sharding Logic
        if (workerId !== undefined && totalWorkers !== undefined) {
            let hash = 0;
            for (let i = 0; i < sessionId.length; i++) {
                hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
            }
            const assignedWorker = Math.abs(hash) % totalWorkers;
            if (assignedWorker !== workerId) {
                continue;
            }
        }

        const { readIncomingMessages, ...socketConfig } = JSON.parse(data);

        if (processedUsers.has(userId)) {
            // Only one active session per user is supported; skip duplicates
            logger.info("init: duplicate session for user skipped", { sessionId, userId });
            continue;
        }
        processedUsers.add(userId);
        logger.info("init: creating session", { sessionId, userId, workerId });
        createSession({ sessionId, userId, readIncomingMessages, socketConfig });
    }
}
//git pull && pm2 restart baileys-api && pm2 logs baileys-api
