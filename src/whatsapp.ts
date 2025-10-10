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

export async function init() {
    const sessions = await prisma.session.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { id: { startsWith: SESSION_CONFIG_ID } },
    });
    logger.info("init: loaded session-config rows", { count: sessions.length });

    const processedUsers = new Set<string>();
    for (const { sessionId, data, userId } of sessions) {
        const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
        let effectiveUserId: string | null = userId;

        // Backward compatibility: if userId not stored in session config, try resolve from UserSession
        if (!effectiveUserId) {
            const userSession = await prisma.userSession.findUnique({ where: { sessionId } });
            effectiveUserId = userSession?.userId ?? null;
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
        logger.info("init: creating session", { sessionId, userId: effectiveUserId });
        createSession({ sessionId, userId: effectiveUserId, readIncomingMessages, socketConfig });
    }
}
//git pull && pm2 restart baileys-api && pm2 logs baileys-api
