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

    const workerId = process.env.WORKER_ID !== undefined ? Number(process.env.WORKER_ID) : null;
    const totalWorkers = process.env.TOTAL_WORKERS !== undefined ? Number(process.env.TOTAL_WORKERS) : 1;

    if (workerId !== null) {
        console.log(`👷 init: trabajador ${workerId}/${totalWorkers} filtrando sus propias sesiones`);
    }

    const userSessions = await prisma.userSession.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { status: "active" },
    });

    console.log("📦 init: sesiones activas obtenidas", {
        count: userSessions.length
    });

    // Función de hashing idéntica a la de cluster.ts para consistencia
    const getWorkerForSession = (sessionId: string) => {
        let hash = 0;
        for (let i = 0; i < sessionId.length; i++) {
            hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % totalWorkers;
    };

    for (const { sessionId, data, userId } of userSessions) {
        // Filtrar si estamos en un cluster
        if (workerId !== null) {
            const targetWorkerId = getWorkerForSession(sessionId);
            if (targetWorkerId !== workerId) {
                // Esta sesión le corresponde a otro trabajador
                continue;
            }
        }

        console.log("🔍 init: procesando sesión", { sessionId, userId });

        if (!data) {
            console.log("⚠️ init: saltando sesión por falta de data", { sessionId, userId });
            continue;
        }

        try {
            const { readIncomingMessages, ...socketConfig } = JSON.parse(data);

            console.log("🟢 init: creando sesión de WhatsApp", {
                sessionId,
                userId
            });

            createSession({ sessionId, userId: userId ?? "", readIncomingMessages, socketConfig });
        } catch (e) {
            console.error(`❌ Error parsing session data for ${sessionId}:`, e);
        }
    }

    console.log("🏁 init: todas las sesiones locales han sido procesadas");
}
