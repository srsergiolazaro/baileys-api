import type { WAMessageContent } from 'baileys';

/**
 * 🚀 SOTA Dual-Cache Layer
 * Protege la base de datos dividiendo la memoria para que los grupos no saturen los mensajes privados.
 */
class MessageCache {
	private personalCache = new Map<string, WAMessageContent>();
	private groupCache = new Map<string, WAMessageContent>();

	private readonly PERSONAL_MAX_SIZE = 4000;
	private readonly GROUP_MAX_SIZE = 1000;

	/**
	 * Busca un mensaje en la memoria RAM instantáneamente O(1)
	 */
	public get(sessionId: string, remoteJid: string, id: string): WAMessageContent | undefined {
		const isGroup = remoteJid.endsWith('@g.us');
		const cache = isGroup ? this.groupCache : this.personalCache;
		const cacheKey = `${sessionId}:${remoteJid}:${id}`;
		
		return cache.get(cacheKey);
	}

	/**
	 * Guarda un mensaje limitando el tamaño del sector (Segregación de Límites)
	 */
	public set(sessionId: string, remoteJid: string, id: string, message: WAMessageContent): void {
		const isGroup = remoteJid.endsWith('@g.us');
		const cache = isGroup ? this.groupCache : this.personalCache;
		const maxSize = isGroup ? this.GROUP_MAX_SIZE : this.PERSONAL_MAX_SIZE;
		const cacheKey = `${sessionId}:${remoteJid}:${id}`;

		if (cache.size >= maxSize) {
			const firstKey = cache.keys().next().value;
			if (firstKey) cache.delete(firstKey);
		}
		
		cache.set(cacheKey, message);
	}

	/**
	 * Limpia todas las cachés
	 */
	public clear() {
		this.personalCache.clear();
		this.groupCache.clear();
	}
}

export const globalMessageCache = new MessageCache();
