
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { logger } from "@/shared";

const CACHE_DIR = path.join(process.cwd(), "temp", "media_cache");
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24; // 24 horas

// Asegurar que el directorio existe
fs.ensureDirSync(CACHE_DIR);

/**
 * Descarga y cachea contenido media desde una URL para evitar redundancia en envíos masivos.
 */
export async function getCachedMedia(url: string): Promise<Buffer> {
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const filePath = path.join(CACHE_DIR, hash);

    // 1. Verificar si existe en caché y no es muy viejo
    if (await fs.pathExists(filePath)) {
        const stats = await fs.stat(filePath);
        const age = Date.now() - stats.mtimeMs;

        if (age < MAX_CACHE_AGE_MS) {
            logger.debug({ url, hash }, "Using cached media file");
            return fs.readFile(filePath);
        }
    }

    // 2. Si no, descargar
    logger.info({ url, hash }, "Downloading media for cache");
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    const buffer = Buffer.from(response.data);

    // 3. Guardar en caché (background)
    fs.writeFile(filePath, buffer).catch((err: Error) => logger.error({ hash, err }, "Failed to save media cache"));

    return buffer;
}

/**
 * Limpieza periódica de la caché
 */
export async function cleanupMediaCache() {
    try {
        const files = await fs.readdir(CACHE_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(CACHE_DIR, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > MAX_CACHE_AGE_MS) {
                await fs.unlink(filePath);
            }
        }
    } catch (e: any) {
        logger.error(e, "Error clearing media cache");
    }
}
