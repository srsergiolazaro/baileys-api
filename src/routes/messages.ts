import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { query, body } from "express-validator";
import multer from "multer";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

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
	apiKeyValidator,
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
 *     description: Envía diferentes tipos de mensajes (texto, imagen, audio, video, contactos, etc.)
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
 *               - type
 *               - message
 *             properties:
 *               jid:
 *                 type: string
 *                 description: Número de teléfono o ID del grupo
 *                 example: "51912519452"
 *               type:
 *                 type: string
 *                 enum: [number, group]
 *                 description: Tipo de destinatario (número o grupo)
 *               message:
 *                 type: object
 *                 oneOf:
 *                   - type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                         description: Mensaje de texto simple
 *                         example: "Pedido nuevo : Descripcion ::::::::"
 *                   - type: object
 *                     properties:
 *                       caption:
 *                         type: string
 *                         description: Texto que acompaña a la imagen
 *                       image:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             description: URL de la imagen
 *                   - type: object
 *                     properties:
 *                       contacts:
 *                         type: object
 *                         properties:
 *                           displayName:
 *                             type: string
 *                             description: Nombre a mostrar para el contacto
 *                           contacts:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 vcard:
 *                                   type: string
 *                                   description: vCard en formato string
 *                   - type: object
 *                     properties:
 *                       audio:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             description: URL del audio
 *                       ptt:
 *                         type: boolean
 *                         description: Si es true, se envía como nota de voz
 *                   - type: object
 *                     properties:
 *                       video:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             description: URL del video
 *                       ptv:
 *                         type: boolean
 *                         description: Si es true, se envía como video temporal
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo a enviar (imagen, video, audio)
 *               jid:
 *                 type: string
 *                 description: Número de teléfono o ID del grupo
 *               type:
 *                 type: string
 *                 enum: [number, group]
 *                 description: Tipo de destinatario
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       403:
 *         description: API key faltante o inválida
 *     examples:
 *       Mensaje de texto:
 *         value:
 *           jid: "51912519452"
 *           type: "number"
 *           message:
 *             text: "Pedido nuevo : Descripcion ::::::::"
 *       Mensaje con imagen:
 *         value:
 *           jid: "51912519452"
 *           type: "number"
 *           message:
 *             caption: "hello????!"
 *             image:
 *               url: "https://ejemplo.com/imagen.jpg"
 *       Mensaje de contacto:
 *         value:
 *           jid: "51912519452"
 *           type: "number"
 *           message:
 *             contacts:
 *               displayName: "Nombre del Contacto"
 *               contacts:
 *                 - vcard: "BEGIN:VCARD\\nVERSION:3.0\\nFN:Nombre\\nTEL:+51912345678\\nEND:VCARD"
 *       Nota de voz:
 *         value:
 *           jid: "51912519452"
 *           type: "number"
 *           message:
 *             audio:
 *               url: "https://ejemplo.com/audio.ogg"
 *             ptt: true
 *       Video temporal:
 *         value:
 *           jid: "51912519452"
 *           type: "number"
 *           message:
 *             video:
 *               url: "https://ejemplo.com/video.mp4"
 *             ptv: true
 */
router.post(
	"/send",
	apiKeyValidator,
	upload.single("file"),
	requestValidator,
	sessionValidator,
	message.send,
);

/**
 * @swagger
 * /messages/send/bulk:
 *   post:
 *     tags:
 *       - Mensajes
 *     summary: Enviar mensajes en masa
 *     description: Envía múltiples mensajes en una sola petición, con opción de retraso entre mensajes
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
 *                   description: ID del destinatario (número o grupo)
 *                   example: "120363xxxxxx@g.us"
 *                 type:
 *                   type: string
 *                   enum: [number, group]
 *                   description: Tipo de destinatario
 *                 delay:
 *                   type: number
 *                   description: Retraso en milisegundos antes de enviar este mensaje
 *                   example: 5000
 *                 message:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                       description: Texto del mensaje
 *                     image:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *                           description: URL de la imagen
 *                     caption:
 *                       type: string
 *                       description: Texto que acompaña a la imagen
 *     responses:
 *       200:
 *         description: Mensajes enviados exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       403:
 *         description: API key faltante o inválida
 *     example:
 *       value:
 *         - jid: "120363xxxxxx@g.us"
 *           type: "group"
 *           message:
 *             text: "Mensaje para el grupo"
 *         - jid: "6285xxxxxx@s.whatsapp.net"
 *           type: "number"
 *           delay: 5000
 *           message:
 *             text: "Mensaje para el número con retraso de 5 segundos"
 */
router.post(
	"/send/bulk",
	apiKeyValidator,
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
 *       - ApiKeyAuth: []
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
	apiKeyValidator,
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
 *       - ApiKeyAuth: []
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
	apiKeyValidator,
	body().isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.downloadContent,
);

export default router;
