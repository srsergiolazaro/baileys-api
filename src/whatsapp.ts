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

	// ============================================================
	// 🚀 SEQUENTIAL INITIALIZATION
	// Procesar sesiones una por una para garantizar estabilidad total (Max Security)
	// ============================================================
	const SESSION_DELAY = 5000; // 5 segundos entre cada sesión

	for (let i = 0; i < userSessions.length; i++) {
		const { sessionId, data, userId } = userSessions[i];
		console.log(`📦 init: procesando sesión ${i + 1}/${userSessions.length}`, { sessionId, userId });

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

			console.log(`🟢 init: iniciando sesión ${sessionId}...`);
			// Iniciamos la sesión (createSession es async pero internamente maneja el proceso)
			await createSession({ sessionId, userId: userId ?? '', readIncomingMessages, socketConfig });
			
			// Esperamos un tiempo prudencial antes de pasar a la siguiente
			if (i < userSessions.length - 1) {
				console.log(`⏳ init: esperando ${SESSION_DELAY}ms para la siguiente sesión...`);
				await new Promise((resolve) => setTimeout(resolve, SESSION_DELAY));
			}
		} catch (e) {
			console.error(`❌ Error iniciando sesión ${sessionId}:`, e);
		}
	}

	console.log('🏁 init: todas las sesiones locales han sido procesadas');
}
