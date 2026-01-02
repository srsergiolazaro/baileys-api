import { prisma } from "./db";
import { logger } from "./shared";

/**
 * Realiza una limpieza general de la base de datos para ahorrar espacio.
 */
export async function performDbCleanup() {
    logger.info("🧹 Iniciando limpieza MASIVA de base de datos...");

    try {
        // Como hemos desactivado el guardado de mensajes, procedemos a borrar TODO el historial
        // para liberar espacio inmediatamente.
        const deletedMessages = await prisma.message.deleteMany({});

        if (deletedMessages.count > 0) {
            logger.info({ count: deletedMessages.count }, "Historial de mensajes purgado por completo");
        }

        // Limpiar datos de sesión huérfanos
        const activeSessions = await prisma.userSession.findMany({ select: { sessionId: true } });
        const activeSessionIds = activeSessions.map(s => s.sessionId);

        const deletedOrphanSessions = await prisma.session.deleteMany({
            where: { sessionId: { notIn: activeSessionIds } }
        });

        if (deletedOrphanSessions.count > 0) {
            logger.info({ count: deletedOrphanSessions.count }, "Datos de sesión huérfanos eliminados");
        }

        logger.info("✅ Limpieza masiva completada");
    } catch (error) {
        logger.error(error, "Fallo durante la limpieza masiva");
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
