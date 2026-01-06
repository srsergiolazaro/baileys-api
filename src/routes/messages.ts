import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
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
 *     description: Obtiene la lista de mensajes de un chat
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: number
 *         description: Cursor para paginación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Límite de resultados
 *     responses:
 *       200:
 *         description: Lista de mensajes obtenida exitosamente
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
 *     description: Envía un mensaje (texto, imagen, video, documento, etc.)
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - jid
 *               - type
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del destinatario
 *               type:
 *                 type: string
 *                 enum: [number, group]
 *                 description: Tipo de destinatario
 *               message:
 *                 type: object
 *                 description: Objeto del mensaje (texto, caption, etc.)
 *               options:
 *                 type: object
 *                 description: Opciones adicionales
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo adjunto (opcional)
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 */
router.post("/send", upload.single("file"), requestValidator, message.send);

/**
 * @swagger
 * /messages/send/bulk:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Enviar mensajes masivos
 *     description: Envía múltiples mensajes en una sola petición
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - jid
 *                 - type
 *                 - message
 *               properties:
 *                 jid:
 *                   type: string
 *                   description: JID del destinatario
 *                 type:
 *                   type: string
 *                   enum: [number, group]
 *                   description: Tipo de destinatario
 *                 message:
 *                   type: object
 *                   description: Contenido del mensaje
 *                 options:
 *                   type: object
 *                   description: Opciones adicionales
 *     responses:
 *       200:
 *         description: Mensajes enviados exitosamente
 */
router.post("/send/bulk", body().isArray().notEmpty(), requestValidator, message.sendBulk);

/**
 * @swagger
 * /messages/download:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Descargar medio
 *     description: Descarga el archivo multimedia de un mensaje
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: object
 *                 description: Objeto del mensaje que contiene el medio
 *     responses:
 *       200:
 *         description: Archivo descargado exitosamente
 */
router.post("/download", body().isObject().notEmpty(), requestValidator, message.download);

/**
 * @swagger
 * /messages/delete:
 *   delete:
 *     tags:
 *       - Mensajes
 *     summary: Eliminar mensaje
 *     description: Elimina un mensaje para todos (si es posible) o para mí
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
 *               - key
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del chat
 *               key:
 *                 type: object
 *                 required:
 *                   - remoteJid
 *                   - fromMe
 *                   - id
 *                 properties:
 *                   remoteJid:
 *                     type: string
 *                   fromMe:
 *                     type: boolean
 *                   id:
 *                     type: string
 *                 description: Clave única del mensaje
 *     responses:
 *       200:
 *         description: Mensaje eliminado exitosamente
 */
router.delete(
	"/delete",
	body("jid").isString().notEmpty(),
	body("key").isObject().notEmpty(),
	requestValidator,
	message.deleteMessage,
);

export default router;
