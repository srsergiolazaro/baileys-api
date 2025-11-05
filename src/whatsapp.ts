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

	for (const { sessionId, data } of sessions) {
		const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
		const userSession = await prisma.userSession.findFirst({
			where: {
				sessionId,
				isActive: true,
			},
		});

		if (userSession) {
			logger.info(`init: creating session ${sessionId}`);
			createSession({ sessionId, userId: userSession.userId, readIncomingMessages, socketConfig });
		}
	}
}
//git pull && pm2 restart baileys-api && pm2 logs baileys-api
