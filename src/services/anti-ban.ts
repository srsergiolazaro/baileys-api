import { Boom } from '@hapi/boom';
import { logger } from '../shared';
import { TelemetryEngine } from './telemetry';

export function setupAntiBanQueue(
	socket: any,
	sessionId: string,
	telemetryEngines: Map<string, TelemetryEngine>,
) {
	const messageQueue: { jid: string; content: any; options: any; resolve: any; reject: any }[] = [];
	let isProcessingQueue = false;

	const originalSendMessage = socket.sendMessage.bind(socket);

	const processQueue = async () => {
		if (isProcessingQueue || messageQueue.length === 0) return;
		isProcessingQueue = true;

		// Solo enviamos 'available' una vez al iniciar el ciclo de la cola
		try {
			await socket.sendPresenceUpdate('available');
		} catch (e) {
			logger.debug({ sessionId, err: e }, 'Failed to set presence to available');
		}

		while (messageQueue.length > 0) {
			const { jid, content, options, resolve, reject } = messageQueue.shift()!;
			try {
				// 1. Notificar al motor de telemetría (Despertar modo FOREGROUND)
				const telEngine = telemetryEngines.get(sessionId);
				if (telEngine) {
					telEngine
						.activityUpdate()
						.catch((e) => logger.debug({ sessionId, err: e }, 'SOTA: Error waking up telemetry'));
				}

				// 2. Extraer el texto para calcular el tiempo de escritura
				const textContent = content?.text || content?.caption || '';

				// 3. Cálculo dinámico de escritura (~40-60ms por carácter, promedio humano rápido)
				let typingDuration = 0;
				if (textContent) {
					// Mínimo 1 segundo, máximo 8 segundos (para no bloquear la cola eternamente)
					typingDuration = Math.min(Math.max(textContent.length * 50, 1000), 8000);
				} else {
					// Si es un audio o imagen sin texto, simulamos el tiempo de "adjuntar" un archivo (1.5s - 3s)
					typingDuration = Math.floor(Math.random() * 1500) + 1500;
				}

				// 4. Simular comportamiento humano: "Escribiendo..."
				await socket.sendPresenceUpdate('composing', jid);

				// Esperar el tiempo calculado
				await new Promise((res) => setTimeout(res, typingDuration));

				// Pausar escritura un breve instante antes de enviar
				await socket.sendPresenceUpdate('paused', jid);
				await new Promise((res) => setTimeout(res, 300));

				// 5. Enviar el mensaje
				const result = await originalSendMessage(jid, content, options);
				resolve(result);
			} catch (err) {
				logger.error({ sessionId, jid, err }, 'Error procesando mensaje en la cola anti-ban');
				reject(err);
			}

			// 6. DELAY POST-ENVÍO (CRÍTICO PARA RÁFAGAS)
			if (messageQueue.length > 0) {
				const humanCooldown = Math.floor(Math.random() * 1500) + 1000; // 1s - 2.5s
				await new Promise((res) => setTimeout(res, humanCooldown));
			}
		}

		isProcessingQueue = false;
	};

	const MAX_QUEUE_SIZE = 200; // Máximo de mensajes en espera por sesión

	socket.sendMessage = (jid: string, content: any, options: any) => {
		return new Promise((resolve, reject) => {
			if (messageQueue.length >= MAX_QUEUE_SIZE) {
				const err = new Boom(
					'Message queue full, anti-ban protection triggered (Too Many Requests)',
					{
						statusCode: 429,
					},
				);
				logger.warn({ sessionId, jid }, 'Message rejected: Queue full');
				return reject(err);
			}

			messageQueue.push({ jid, content, options, resolve, reject });
			processQueue();
		});
	};
}
