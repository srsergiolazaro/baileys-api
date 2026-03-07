import { prisma } from './db';
import { createSession } from './services/baileys';
import { syncSessionStatusOnStartup } from './services/session';

export { jidExists } from './utils';
import {
	getSessionStatus,
	listSessions,
	getSession,
	deleteSession,
	sessionExists,
	stopSession,
	isRestarting,
	setRestartingLock,
	clearRestartingLock,
} from './services/session';

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
};

export async function init(retries = 3) {
	console.log('🚀 init: iniciando carga de sesiones');

	let userSessions: any[] = [];
	for (let i = 0; i < retries; i++) {
		try {
			userSessions = await prisma.userSession.findMany({
				select: { sessionId: true, data: true, userId: true },
				where: { status: { in: ['active', 'authenticating'] } },
			});
			break; // Success
		} catch (e) {
			console.error(`❌ init: Error obteniendo sesiones (intento ${i + 1}/${retries})`, e);
			if (i < retries - 1) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} else {
				throw e; // Final failure
			}
		}
	}

	// Sincronizar estados en BD (Limpiar zombies de procesos anteriores)
	// Importante: Hacerlo después de obtener la lista para poder reiniciar las legítimas.
	await syncSessionStatusOnStartup();

	console.log('📦 init: sesiones activas obtenidas', {
		count: userSessions.length,
	});

	for (const { sessionId, data, userId } of userSessions) {
		console.log('🔍 init: procesando sesión', { sessionId, userId });

		if (!data) {
			console.log('⚠️ init: saltando sesión por falta de data', { sessionId, userId });
			continue;
		}

		try {
			if (sessionExists(sessionId) || isRestarting(sessionId)) {
				console.log(
					`⚠️ init: la sesión ${sessionId} ya está activa o en proceso de inicio, saltando...`,
				);
				continue;
			}

			const { readIncomingMessages, ...socketConfig } = JSON.parse(data);

			// ============================================================
			// 🎲 STAGGERED START (Jitter)
			// Recomendación del creador: Evita que todas las sesiones conecten
			// al mismo tiempo desde la misma IP.
			// ============================================================
			const staggerDelay = Math.floor(Math.random() * 1000) + 500; // Entre 0.5s y 1.5s
			await new Promise((resolve) => setTimeout(resolve, staggerDelay));

			console.log(`🟢 init: creando sesión (${staggerDelay}ms delay)`, {
				sessionId,
				userId,
			});

			createSession({ sessionId, userId: userId ?? '', readIncomingMessages, socketConfig });
		} catch (e) {
			console.error(`❌ Error parsing session data for ${sessionId}:`, e);
		}
	}

	console.log('🏁 init: todas las sesiones locales han sido procesadas');
}
