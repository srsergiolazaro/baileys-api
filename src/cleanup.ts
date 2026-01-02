import { prisma } from "./db";
import { logger } from "./shared";

/**
 * Realiza una limpieza general de la base de datos para ahorrar espacio.
 */
export async function performDbCleanup() {
    logger.info("🧹 Iniciando limpieza de base de datos...");

    try {
        // 1. Borrar mensajes de más de 7 días
        // Calculamos el timestamp de hace 7 días en segundos (Baileys usa segundos)
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

        const deletedMessages = await prisma.message.deleteMany({
            where: {
                messageTimestamp: {
                    lt: BigInt(sevenDaysAgo)
                }
            }
        });

        if (deletedMessages.count > 0) {
            logger.info({ count: deletedMessages.count }, "Mensajes antiguos eliminados");
        }

        // 2. Limpiar la tabla Session de datos que no pertenecen a sesiones activas
        // Buscamos sesiones en la tabla Session que no tengan un UserSession correspondiente
        const activeSessions = await prisma.userSession.findMany({
            select: { sessionId: true }
        });
        const activeSessionIds = activeSessions.map(s => s.sessionId);

        const deletedOrphanSessions = await prisma.session.deleteMany({
            where: {
                sessionId: {
                    notIn: activeSessionIds
                }
            }
        });

        if (deletedOrphanSessions.count > 0) {
            logger.info({ count: deletedOrphanSessions.count }, "Datos de sesión huérfanos eliminados");
        }

        logger.info("✅ Limpieza de base de datos completada");
    } catch (error) {
        logger.error(error, "Fallo durante la limpieza de la base de datos");
    }
}

/**
 * Inicia el intervalo de limpieza (cada 24 horas)
 */
export function startCleanupTask() {
    // Ejecutar una vez al inicio
    performDbCleanup();

    // Programar cada 24 horas
    setInterval(performDbCleanup, 24 * 60 * 60 * 1000);
}
