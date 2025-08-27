import { Router } from "express";
import { session } from "@/controllers";
import { getUserSessions } from "@/controllers/session";
import sessionValidator from "@/middlewares/session-validator";
import { body } from "express-validator";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

const router = Router();

/**
 * @swagger
 * /sessions:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Obtener lista de sesiones del usuario
 *     description: Retorna la lista de todas las sesiones del usuario autenticado desde la tabla UserSession
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: x-api-key
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key para autenticación
 *     responses:
 *       200:
 *         description: Lista de sesiones obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: ID único de la sesión
 *                   sessionId:
 *                     type: string
 *                     description: ID de la sesión de WhatsApp
 *                   status:
 *                     type: string
 *                     description: Estado de la sesión (active/inactive/expired)
 *                   phoneNumber:
 *                     type: string
 *                     description: Número de teléfono asociado a la sesión
 *                   deviceName:
 *                     type: string
 *                     description: Nombre del dispositivo
 *                   lastActive:
 *                     type: string
 *                     format: date-time
 *                     description: Última vez que la sesión estuvo activa
 *                   isConnected:
 *                     type: boolean
 *                     description: Indica si la sesión está actualmente conectada
 *                   connectionStatus:
 *                     type: string
 *                     description: Estado de conexión detallado (CONNECTING, CONNECTED, etc.)
 *       401:
 *         description: No autorizado - API Key inválida o faltante
 *       500:
 *         description: Error interno del servidor
 */
router.get("/", apiKeyValidator, getUserSessions);

/**
 * @swagger
 * /sessions/status:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Obtener estado de la sesión
 *     description: Retorna el estado actual de una sesión específica
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Estado de la sesión obtenido exitosamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Sesión no encontrada
 */
router.get("/status", apiKeyValidator, sessionValidator, session.status);

/**
 * @swagger
 * /sessions/add:
 *   post:
 *     tags:
 *       - Sesiones
 *     summary: Agregar nueva sesión
 *     description: Crea una nueva sesión de WhatsApp
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
 *                 description: Identificador único de la sesión
 *     responses:
 *       200:
 *         description: Sesión creada exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/add",
	body("sessionId").isString().notEmpty(),
	//apiKeyValidatorParam,
	//requestValidator,
	session.add,
);

/**
 * @swagger
 * /sessions/add-sse:
 *   get:
 *     tags:
 *       - Sesiones
 *     summary: Agregar sesión con SSE
 *     description: Crea una nueva sesión utilizando Server-Sent Events
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único de la sesión
 *     responses:
 *       200:
 *         description: Conexión SSE establecida exitosamente
 *       400:
 *         description: SessionId requerido
 */
router.get("/add-sse", session.addSSE);

/**
 * @swagger
 * /sessions:
 *   delete:
 *     tags:
 *       - Sesiones
 *     summary: Eliminar sesión
 *     description: Elimina una sesión existente
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Sesión eliminada exitosamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Sesión no encontrada
 */
router.delete("/", apiKeyValidator, sessionValidator, session.del);

export default router;
