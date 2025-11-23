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

const SESSION_CONFIG_ID = "session-config";

export async function init(workerId?: number, totalWorkers?: number) {
    const sessions = await prisma.session.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { id: { startsWith: SESSION_CONFIG_ID } },
    });
    logger.info("init: loaded session-config rows", { count: sessions.length, workerId });

    const processedUsers = new Set<string>();
    for (const { sessionId, data, userId } of sessions) {
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
        let effectiveUserId: string | null = userId;

        if (!userId) {
            logger.warn(`init: skipping inactive or missing session ${sessionId}`);
            continue;
        }

        if (!effectiveUserId) {
            logger.warn("init: skipping session due to missing userId", { sessionId });
            continue;
        }
        if (processedUsers.has(effectiveUserId)) {
            // Only one active session per user is supported; skip duplicates
            logger.info("init: duplicate session for user skipped", { sessionId, userId: effectiveUserId });
            continue;
        }
        processedUsers.add(effectiveUserId);
        logger.info("init: creating session", { sessionId, userId: effectiveUserId, workerId });
        createSession({ sessionId, userId: effectiveUserId, readIncomingMessages, socketConfig });
    }
}
//git pull && pm2 restart baileys-api && pm2 logs baileys-api
