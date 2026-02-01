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
    stopSession,
    isRestarting,
    setRestartingLock,
    clearRestartingLock,
} from "./services/session";

export async function init() {
    console.log("🚀 init: iniciando carga de sesiones");

    const userSessions = await prisma.userSession.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { status: "active" },
    });

    console.log("📦 init: sesiones activas obtenidas", {
        count: userSessions.length
    });

    for (const { sessionId, data, userId } of userSessions) {
        console.log("🔍 init: procesando sesión", { sessionId, userId });

        if (!data) {
            console.log("⚠️ init: saltando sesión por falta de data", { sessionId, userId });
            continue;
        }

        const { readIncomingMessages, ...socketConfig } = JSON.parse(data);

        console.log("🟢 init: creando sesión de WhatsApp", {
            sessionId,
            userId
        });

        createSession({ sessionId, userId, readIncomingMessages, socketConfig });
    }

    console.log("🏁 init: todas las sesiones han sido procesadas");
}
