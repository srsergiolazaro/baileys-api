import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { query, body } from "express-validator";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /messages:
 *   get:
 *     tags:
 *       - Mensajes
 *     summary: Listar mensajes
 *     description: Obtiene una lista paginada de mensajes
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
 *         description: Límite de mensajes a retornar
 *     responses:
 *       200:
 *         description: Lista de mensajes obtenida exitosamente
 *       400:
 *         description: Parámetros de consulta inválidos
 */
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	message.list,
);

/**
 * @swagger
 * /messages/send:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Enviar mensaje
 *     description: Envía un mensaje con opción de adjuntar archivo
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo a enviar
 *               message:
 *                 type: string
 *                 description: Texto del mensaje
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado
 */
router.post("/send", upload.single("file"), requestValidator, sessionValidator, message.send);

/**
 * @swagger
 * /messages/send/bulk:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Enviar mensajes en masa
 *     description: Envía múltiples mensajes en una sola petición
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 to:
 *                   type: string
 *                   description: Destinatario del mensaje
 *                 message:
 *                   type: string
 *                   description: Contenido del mensaje
 *     responses:
 *       200:
 *         description: Mensajes enviados exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado
 */
router.post(
	"/send/bulk",
	body().isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	message.sendBulk,
);

/**
 * @swagger
 * /messages/download:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Descargar mensaje
 *     description: Descarga un mensaje específico
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageId
 *             properties:
 *               messageId:
 *                 type: string
 *                 description: ID del mensaje a descargar
 *     responses:
 *       200:
 *         description: Mensaje descargado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Mensaje no encontrado
 */
router.post(
	"/download",
	body().isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.download,
);

/**
 * @swagger
 * /messages/downloadcontent:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Descargar contenido del mensaje
 *     description: Descarga el contenido multimedia de un mensaje
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageId
 *             properties:
 *               messageId:
 *                 type: string
 *                 description: ID del mensaje cuyo contenido se desea descargar
 *     responses:
 *       200:
 *         description: Contenido descargado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Contenido no encontrado
 */
router.post(
	"/downloadcontent",
	body().isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.downloadContent,
);

export default router;
