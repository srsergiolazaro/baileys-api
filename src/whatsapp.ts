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
    console.log("🚀 init: iniciando carga de sesiones", { workerId, totalWorkers });

    const userSessions = await prisma.userSession.findMany({
        select: { sessionId: true, data: true, userId: true },
        where: { status: "active" },
    });

    console.log("📦 init: sesiones activas obtenidas", {
        count: userSessions.length,
        workerId
    });

    const processedUsers = new Set<string>();

    for (const { sessionId, data, userId } of userSessions) {
        console.log("🔍 init: procesando sesión", { sessionId, userId, workerId });

        if (!data) {
            console.log("⚠️ init: saltando sesión por falta de data", { sessionId, userId });
            continue;
        }

        // Sharding
        if (workerId !== undefined && totalWorkers !== undefined) {
            let hash = 0;
            for (let i = 0; i < sessionId.length; i++) {
                hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
            }
            const assignedWorker = Math.abs(hash) % totalWorkers;

            console.log("🧮 init: sharding calculado", {
                sessionId,
                assignedWorker,
                workerId
            });

            if (assignedWorker !== workerId) {
                console.log("➡️ init: sesión asignada a otro worker, se omite", {
                    sessionId,
                    userId,
                    assignedWorker,
                    workerId
                });
                continue;
            }
        }

        const { readIncomingMessages, ...socketConfig } = JSON.parse(data);

        if (processedUsers.has(userId)) {
            console.log("⚠️ init: usuario ya tiene una sesión activa, se omite duplicada", {
                sessionId,
                userId
            });
            continue;
        }

        processedUsers.add(userId);

        console.log("🟢 init: creando sesión de WhatsApp", {
            sessionId,
            userId,
            workerId
        });

        createSession({ sessionId, userId, readIncomingMessages, socketConfig });
    }

    console.log("🏁 init: todas las sesiones han sido procesadas", { workerId });
}

//git pull && pm2 restart baileys-api && pm2 logs baileys-api
