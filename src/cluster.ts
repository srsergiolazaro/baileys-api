import cluster from "cluster";
import os from "os";
import express from "express";
import axios from "axios";
import { logger } from "./shared";
import { init } from "./whatsapp";
import type { Request, Response, NextFunction } from "express";

const numCPUs = os.cpus().length;
const TOTAL_WORKERS = Number(process.env.TOTAL_WORKERS || numCPUs);
const BASE_PORT = Number(process.env.PORT || 3000);

export function startCluster(appWorker: (workerId: number, totalWorkers: number) => void) {
    if (cluster.isPrimary) {
        logger.info(`Master ${process.pid} is running`);
        logger.info(`Forking ${TOTAL_WORKERS} workers...`);

        const workers: { [key: number]: { worker: any; port: number } } = {};

        // Fork workers
        for (let i = 0; i < TOTAL_WORKERS; i++) {
            const port = BASE_PORT + 1 + i; // Assign a unique port to each worker
            const worker = cluster.fork({ WORKER_ID: i, PORT: port, TOTAL_WORKERS });
            workers[i] = { worker, port };
        }

        cluster.on("exit", (worker, code, signal) => {
            logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
            // Find the ID of the dead worker
            let deadWorkerId = -1;
            for (const id in workers) {
                if (workers[id].worker === worker) {
                    deadWorkerId = Number(id);
                    break;
                }
            }

            if (deadWorkerId !== -1) {
                const port = workers[deadWorkerId].port;
                const newWorker = cluster.fork({
                    WORKER_ID: deadWorkerId,
                    PORT: port,
                    TOTAL_WORKERS,
                });
                workers[deadWorkerId] = { worker: newWorker, port };
            }
        });

        // Master Server (Reverse Proxy)
        const masterApp = express();
        masterApp.use(express.json()); // Ensure body parsing for session ID extraction

        // Helper to determine which worker handles a session
        const getWorkerForSession = (sessionId: string) => {
            let hash = 0;
            for (let i = 0; i < sessionId.length; i++) {
                hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
            }
            return Math.abs(hash) % TOTAL_WORKERS;
        };

        // Proxy Middleware
        masterApp.use(async (req: Request, res: Response, next: NextFunction) => {
            // Extract sessionId from URL or Body
            // URL pattern: /sessions/:sessionId/... or query param ?sessionId=...
            let sessionId = req.params.sessionId || req.query.sessionId || req.body.sessionId;

            // Try to extract from path if not found (e.g. /sessions/my-session/logout)
            if (!sessionId) {
                const parts = req.path.split("/");
                // Simple heuristic: check if any part looks like a UUID or session ID
                // This might need refinement based on actual URL structure
                // For now, let's assume standard REST paths
            }

            // Special handling for session creation to distribute load
            if (req.path === '/sessions/add' && req.method === 'POST') {
                sessionId = req.body.sessionId;
            }

            let targetPort = workers[0].port; // Default to first worker
            if (sessionId) {
                const workerId = getWorkerForSession(String(sessionId));
                targetPort = workers[workerId].port;
            } else {
                // Round robin
                const workerId = Math.floor(Math.random() * TOTAL_WORKERS);
                targetPort = workers[workerId].port;
            }

            const targetUrl = `http://localhost:${targetPort}${req.originalUrl}`;

            try {
                // Forward request using axios
                const response = await axios({
                    method: req.method,
                    url: targetUrl,
                    data: req.body,
                    headers: { ...req.headers, host: `localhost:${targetPort}` },
                    validateStatus: () => true, // Accept all status codes
                    responseType: 'stream'
                });

                res.status(response.status);
                res.set(response.headers);
                response.data.pipe(res);
            } catch (error) {
                logger.error(`Proxy error: ${error}`);
                res.status(502).json({ error: "Bad Gateway" });
            }
        });

        masterApp.listen(BASE_PORT, () => {
            logger.info(`Master server listening on port ${BASE_PORT}`);
        });
    } else {
        // Worker Process
        const workerId = Number(process.env.WORKER_ID);
        const totalWorkers = Number(process.env.TOTAL_WORKERS);
        logger.info(`Worker ${process.pid} started (ID: ${workerId})`);

        appWorker(workerId, totalWorkers);
    }
}
