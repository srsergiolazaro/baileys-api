import { token } from "@/controllers";
import { Router } from "express";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /token/generate-api-key:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Generar API Key
 *     description: Genera una nueva API Key para autenticar las peticiones
 *     responses:
 *       200:
 *         description: API Key generada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKey:
 *                   type: string
 *                   description: API Key generada
 *       500:
 *         description: Error al generar la API Key
 */
router.post("/generate-api-key", token.create);

export default router;
