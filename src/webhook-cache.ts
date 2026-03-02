import { prisma } from './db';

/**
 * Caché simple en memoria para evitar consultas repetitivas a la DB.
 * Tiempo de vida: 1 minuto (o hasta que se actualice un webhook vía API).
 */
class WebhookCache {
	private cache: Map<string, { urls: any[]; expires: number }> = new Map();
	private TTL = 24 * 60 * 60 * 1000; // 24 horas - reducir queries a DB

	async getWebhooks(sessionId: string, type: string) {
		const cacheKey = `${sessionId}_${type}`;
		const cached = this.cache.get(cacheKey);

		if (cached && cached.expires > Date.now()) {
			return cached.urls;
		}

		const webhooks = await prisma.webhook.findMany({
			where: { sessionId, webhookType: type },
		});

		this.cache.set(cacheKey, {
			urls: webhooks,
			expires: Date.now() + this.TTL,
		});

		return webhooks;
	}

	clear(sessionId?: string) {
		if (sessionId) {
			for (const key of this.cache.keys()) {
				if (key.startsWith(`${sessionId}_`)) {
					this.cache.delete(key);
				}
			}
		} else {
			this.cache.clear();
		}
	}
}

export const webhookCache = new WebhookCache();
