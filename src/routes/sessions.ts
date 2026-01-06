import { Router } from "express";
import { session } from "@/controllers";
import { getUserSessions } from "@/controllers/session";
import { body } from "express-validator";

const router = Router();

/**
 * @swagger
 * /sessions/list:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Listar sesiones
 *     description: Obtiene la lista de todas las sesiones activas
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de sesiones obtenida exitosamente
 */
router.get("/list", getUserSessions);

/**
 * @swagger
 * /sessions/status:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Estado de la sesión
 *     description: Obtiene el estado actual de la sesión
 *     security:
 *       - ApiKeyAuth: []
 *       - SessionId: []
 *     parameters:
 *       - in: header
 *         name: x-session-id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión
 *     responses:
 *       200:
 *         description: Estado de la sesión obtenido exitosamente
 *       404:
 *         description: Sesión no encontrada
 */
router.get("/status", session.status);

/**
 * @swagger
 * /sessions/add:
 *   post:
 *     tags:
 *       - Sesiones
 *     summary: Agregar nueva sesión
 *     description: Crea una nueva sesión de WhatsApp para el usuario autenticado
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: ID único para la nueva sesión
 *     responses:
 *       200:
 *         description: Sesión creada exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado - API Key inválida
 */
router.post("/add", body("sessionId").isString().notEmpty(), session.add);

/**
 * @swagger
 * /sessions/add-sse:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Añadir una nueva sesión con Server-Sent Events
 *     description: Inicia el proceso de autenticación para una nueva sesión usando SSE
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único para la nueva sesión
 *     responses:
 *       200:
 *         description: Eventos SSE para la autenticación
 *       400:
 *         description: SessionId requerido
 *       401:
 *         description: No autorizado - API Key inválida
 */
router.get("/add-sse", session.addSSE);

/**
 * @swagger
 * /sessions:
 *   delete:
 *     tags:
 *       - Sesiones
 *     summary: Eliminar sesión
 *     description: Elimina la sesión actual del usuario
 *     security:
 *       - ApiKeyAuth: []
 *       - SessionId: []
 *     parameters:
 *       - in: header
 *         name: x-session-id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión a eliminar
 *     responses:
 *       200:
 *         description: Sesión eliminada exitosamente
 *       401:
 *         description: No autorizado - API Key o Session ID inválidos
 *       404:
 *         description: Sesión no encontrada
 */
router.delete("/", session.del);

export default router;
