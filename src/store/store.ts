import type { BaileysEventEmitter } from "baileys";
import { logger } from "@/shared";
import * as handlers from "./handlers";

export class Store {
	private readonly chatHandler;
	private readonly messageHandler;
	private readonly contactHandler;
	private readonly groupMetadataHandler;
	private readonly sessionId: string;

	constructor(sessionId: string, event: BaileysEventEmitter) {
		this.sessionId = sessionId;
		this.chatHandler = handlers.chatHandler(sessionId, event);
		this.messageHandler = handlers.messageHandler(sessionId, event);
		this.contactHandler = handlers.contactHandler(sessionId, event);
		this.groupMetadataHandler = handlers.groupMetadataHandler(sessionId, event);

		// 🚀 PATRÓN SOTA: Procesamiento por lotes (Bundled Processing)
		// Consolidar eventos de mensajes para evitar condiciones de carrera
		(event as any).process(async (events: any) => {
			if (events["messaging-history.set"]) {
				await this.messageHandler.set(events["messaging-history.set"]);
			}
			if (events["messages.upsert"]) {
				await this.messageHandler.upsert(events["messages.upsert"]);
			}
			if (events["messages.update"]) {
				await this.messageHandler.update(events["messages.update"]);
			}
			if (events["messages.delete"]) {
				await this.messageHandler.del(events["messages.delete"]);
			}
			if (events["message-receipt.update"]) {
				await this.messageHandler.updateReceipt(events["message-receipt.update"]);
			}
			if (events["messages.reaction"]) {
				await this.messageHandler.updateReaction(events["messages.reaction"]);
			}

			// 🚀 SOTA: Backpressure Management (Memory-Aware)
			this.checkMemoryPressure(event);

			// Otros handlers (Chat, Contacts, etc) siguen usando sus listeners internos
			// o podrían ser migrados aquí también.
		});
	}

	private processedCount = 0;
	private isPaused = false;
	private readonly MEMORY_THRESHOLD = 0.8; // 80% del heap

	private checkMemoryPressure(event: any) {
		this.processedCount++;
		if (this.processedCount < 50) return; // Solo chequear cada 50 ciclos para no saturar CPU
		this.processedCount = 0;

		const usage = process.memoryUsage();
		const heapUsedPercent = usage.heapUsed / usage.heapTotal;

		if (heapUsedPercent > this.MEMORY_THRESHOLD && !this.isPaused) {
			if (typeof event.ws?.pause === "function") {
				event.ws.pause();
				this.isPaused = true;
				logger.warn({ sessionId: this.sessionId, heapUsedPercent }, "⚠️ SOTA: Backpressure activated - Pausing WebSocket");
			}
		} else if (heapUsedPercent < (this.MEMORY_THRESHOLD * 0.7) && this.isPaused) {
			if (typeof event.ws?.resume === "function") {
				event.ws.resume();
				this.isPaused = false;
				logger.info({ sessionId: this.sessionId, heapUsedPercent }, "✅ SOTA: Backpressure deactivated - Resuming WebSocket");
			}
		}
	}

	public listen() {
		// Los handlers individuales aún pueden tener listeners para eventos no procesados en el lote
		this.chatHandler.listen();
		this.contactHandler.listen();
		this.groupMetadataHandler.listen();
	}

	public unlisten() {
		this.chatHandler.unlisten();
		this.messageHandler.unlisten();
		this.contactHandler.unlisten();
		this.groupMetadataHandler.unlisten();
	}
}
