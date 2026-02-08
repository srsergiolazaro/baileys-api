import { logger } from "../shared";
import { randomUUID } from "node:crypto";
// @ts-ignore
import { BinaryInfo, encodeWAM } from "baileys/lib/WAM/index.js";

/**
 * TelemetryEngine: Simula el mimetismo absoluto de un cliente oficial.
 * Blindaje contra Análisis Heurístico (HBA) mediante Ciclos de Vida (Fore/Back).
 */
export class TelemetryEngine {
    private interval: NodeJS.Timeout | null = null;
    private sessionId: string;
    private socket: any;
    private sequenceNumber = Math.floor(Math.random() * 1000);
    private startTime = Date.now();
    private isForeground = true;
    private lastActivityTime = Date.now();

    constructor(sessionId: string, socket: any) {
        this.sessionId = sessionId;
        this.socket = socket;
    }

    /**
     * Inicia el motor y simula la carga inicial en Foreground
     */
    public async start() {
        if (this.interval) return;
        logger.info({ sessionId: this.sessionId }, "🚀 Telemetry Engine: SOTA-Absolute (Activity-Aware)");

        await this.setMode("FOREGROUND");
        await this.sendAppOpenEvent();
        await this.sendFingerprintEvent();

        const scheduleNext = () => {
            const minDelay = this.isForeground ? 60000 : 180000;
            const maxDelay = this.isForeground ? 180000 : 420000;
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            this.interval = setTimeout(async () => {
                await this.sendPulse();

                // Si estamos en Background pero hubo actividad reciente (< 5 min), forzar Foreground
                const timeSinceActivity = Date.now() - this.lastActivityTime;
                if (!this.isForeground && timeSinceActivity < 300000) {
                    await this.setMode("FOREGROUND");
                }
                // Si estamos en Foreground pero NO ha habido actividad (> 10 min), permitir Background
                else if (this.isForeground && timeSinceActivity > 600000 && Math.random() > 0.7) {
                    await this.setMode("BACKGROUND");
                }

                if (this.isForeground && Math.random() > 0.5) {
                    await this.sendScrollEvent();
                }

                scheduleNext();
            }, delay);
        };
        scheduleNext();
    }

    /**
     * Método público para "despertar" al bot desde el exterior (ej. al enviar un mensaje)
     */
    public async activityUpdate() {
        this.lastActivityTime = Date.now();
        if (!this.isForeground) {
            logger.debug({ sessionId: this.sessionId }, "⚡ Activity detected: Forcing FOREGROUND mode");
            await this.setMode("FOREGROUND");
        }
    }

    public async setMode(mode: "FOREGROUND" | "BACKGROUND") {
        if (this.isForeground === (mode === "FOREGROUND")) return; // Evitar duplicados

        this.isForeground = (mode === "FOREGROUND");

        try {
            if (this.socket?.sendPresenceUpdate) {
                await this.socket.sendPresenceUpdate(this.isForeground ? "available" : "unavailable");
            }
            await this.sendAppStateEvent();
        } catch (e) {
            logger.debug("SOTA: Mode change failed", e);
        }
    }

    public stop() {
        if (this.interval) {
            clearTimeout(this.interval);
            this.interval = null;
        }
    }

    private getSharedGlobals() {
        const mem = process.memoryUsage();
        return {
            isForeground: this.isForeground ? 1 : 0,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            jsHeapSizeLimit: Math.floor(mem.heapTotal / 1024 / 1024),
            usedJsHeapSize: Math.floor(mem.heapUsed / 1024 / 1024),
            webcRuntimeEnv: 1
        };
    }

    private async sendAppStateEvent() {
        try {
            const wam = new BinaryInfo();
            wam.protocolVersion = 19;
            wam.sequence = this.sequenceNumber++;

            wam.events.push({
                SignCredential: {
                    props: {
                        applicationState: this.isForeground ? 1 : 2,
                        signCredentialResult: 1,
                        waConnectedToChatd: 1
                    },
                    globals: this.getSharedGlobals()
                }
            });

            await this.dispatch(wam);
        } catch (e) {
            logger.debug("SOTA: AppState event failed", e);
        }
    }

    public async sendFingerprintEvent() {
        try {
            const wam = new BinaryInfo();
            wam.protocolVersion = 19;
            wam.sequence = this.sequenceNumber++;

            wam.events.push({
                WebcFingerprint: {
                    props: {
                        browserEngine: 0,
                        platformEstimate: 0,
                        webcWindowNavigatorWebdriver: 0,
                        screenResolution: "1920x1080",
                        viewportSize: "1920x937",
                        timezone: "Europe/Madrid",
                        touchPresence: 0,
                        pdfViewerEnabled: 1
                    },
                    globals: this.getSharedGlobals()
                }
            });

            await this.dispatch(wam);
        } catch (e) {
            logger.debug("SOTA: Fingerprint failed", e);
        }
    }

    public async sendAppOpenEvent() {
        try {
            const wam = new BinaryInfo();
            wam.protocolVersion = 19;
            wam.sequence = this.sequenceNumber++;

            wam.events.push({
                WebcPageLoad: {
                    props: {
                        webcPageLoadId: randomUUID(),
                        webcPageLoadT: 1540,
                        webcDomInteractive: 920,
                        webcQrCode: 1,
                        webcNavigation: 0
                    },
                    globals: this.getSharedGlobals()
                }
            });

            await this.dispatch(wam);
        } catch (e) {
            logger.debug("SOTA: AppOpen failed", e);
        }
    }

    public async sendScrollEvent() {
        try {
            const wam = new BinaryInfo();
            wam.protocolVersion = 19;
            wam.sequence = this.sequenceNumber++;

            wam.events.push({
                UpdatesTabSearch: {
                    props: {
                        updatesTabSearchSessionId: randomUUID(),
                        updateTabSearchEventType: 7,
                        recentStatusItemCount: Math.floor(Math.random() * 10),
                        viewedStatusItemCount: Math.floor(Math.random() * 5),
                        channelsFollowedCount: 1
                    },
                    globals: this.getSharedGlobals()
                }
            });

            await this.dispatch(wam);
        } catch (e) {
            logger.debug("SOTA: Scroll failed", e);
        }
    }

    private async sendPulse() {
        try {
            if (!this.socket?.ws || this.socket.ws.readyState !== 1) return;
            const battery = Math.min(100, Math.max(10, 85 - Math.floor((Date.now() - this.startTime) / 600000)));

            if (typeof this.socket.query === "function") {
                await this.socket.query({
                    tag: "iq",
                    attrs: { to: "s.whatsapp.net", type: "set", xmlns: "w:stats" },
                    content: [{
                        tag: "add",
                        attrs: { t: Math.floor(Date.now() / 1000).toString() },
                        content: Buffer.from([battery, 0])
                    }]
                });
            }
        } catch (e) {
            logger.debug("SOTA: Pulse failed", e);
        }
    }

    private async dispatch(wam: any) {
        if (!this.socket?.query) return;
        const buffer = encodeWAM(wam);
        await this.socket.query({
            tag: "iq",
            attrs: { to: "s.whatsapp.net", type: "set", xmlns: "w:stats" },
            content: [{
                tag: "add",
                attrs: { t: Math.round(Date.now() / 1000).toString() },
                content: buffer
            }]
        });
    }
}
