import { prisma } from "./db";
import { createSession } from "./services/baileys";
export { jidExists } from "./utils";
export {
	getSessionStatus,
	listSessions,
	getSession,
	deleteSession,
	sessionExists,
} from "./services/session";

export async function init() {
	const sessions = await prisma.session.findMany({
		select: { sessionId: true, data: true, userId: true },
	});

	for (const { sessionId, data, userId } of sessions) {
		const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
		if (!userId) {
			continue;
		}
		createSession({ sessionId, userId, readIncomingMessages, socketConfig });
	}
}
