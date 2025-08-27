import { Router } from "express";
import { query, body } from "express-validator";
import { chat } from "../controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /chats:
 *   get:
 *     tags:
 *       - Chats
 *     summary: Listar chats
 *     description: Obtiene una lista paginada de todos los chats
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: number
 *         description: Cursor para la paginación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Límite de chats a retornar
 *     responses:
 *       200:
 *         description: Lista de chats obtenida exitosamente
 *       400:
 *         description: Parámetros de consulta inválidos
 */
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	chat.list,
);

/**
 * @swagger
 * /chats/{jid}:
 *   get:
 *     tags:
 *       - Chats
 *     summary: Obtener chat específico
 *     description: Obtiene la información de un chat por su JID
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del chat (JID)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: number
 *         description: Cursor para la paginación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Límite de mensajes a retornar
 *     responses:
 *       200:
 *         description: Chat encontrado exitosamente
 *       404:
 *         description: Chat no encontrado
 */
router.get(
	"/:jid",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	sessionValidator,
	chat.find,
);

/**
 * @swagger
 * /chats/mute:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Silenciar chat
 *     description: Silencia las notificaciones de un chat por una duración específica
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jid
 *               - duration
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del chat (JID)
 *               duration:
 *                 type: number
 *                 description: Duración del silencio en segundos
 *     responses:
 *       200:
 *         description: Chat silenciado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/mute",
	body("jid").isString().notEmpty(),
	body("duration").isNumeric().notEmpty(),
	requestValidator,
	sessionValidator,
	chat.mute,
);

/**
 * @swagger
 * /chats/read:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Marcar mensajes como leídos
 *     description: Marca uno o varios mensajes como leídos en un chat
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jid
 *               - messageIds
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del chat (JID)
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de IDs de mensajes a marcar como leídos
 *     responses:
 *       200:
 *         description: Mensajes marcados como leídos exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/read",
	body("jid").isString().notEmpty(),
	body("messageIds").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	chat.markRead,
);

/**
 * @swagger
 * /chats/disappearing:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Configurar mensajes temporales
 *     description: Configura la duración de los mensajes temporales en un chat
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jid
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del chat (JID)
 *               duration:
 *                 type: number
 *                 description: Duración en segundos para los mensajes temporales (0 para desactivar)
 *     responses:
 *       200:
 *         description: Configuración de mensajes temporales actualizada exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/disappearing",
	body("jid").isString().notEmpty(),
	body("duration").isNumeric().optional(),
	requestValidator,
	sessionValidator,
	chat.setDisappearing,
);

export default router;
