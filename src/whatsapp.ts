import { prisma } from "./db";
import { createSession as createBaileysSession } from "./services/baileys";
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
		select: { sessionId: true, data: true },
		where: { id: { startsWith: SESSION_CONFIG_ID } },
	});

	for (const { sessionId, data } of sessions) {
		const { readIncomingMessages, ...socketConfig } = JSON.parse(data);
		createBaileysSession({ sessionId, readIncomingMessages, socketConfig });
	}
}

export const createSession = createBaileysSession;


