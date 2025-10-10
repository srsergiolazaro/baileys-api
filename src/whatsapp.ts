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

const SESSION_CONFIG_ID = "session-config";

export async function init() {
	const sessions = await prisma.session.findMany({
		select: { sessionId: true, data: true, userId: true },
		where: { id: { startsWith: SESSION_CONFIG_ID } },
	});
	console.log("sessions", sessions);

	for (const { sessionId, data, userId } of sessions) {
		const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
		if (!userId) {
			continue;
		}
		createSession({ sessionId, userId, readIncomingMessages, socketConfig });
	}
}
