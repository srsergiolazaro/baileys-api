import { Router } from 'express';
import { query, body } from 'express-validator';
import { chat } from '../controllers';
import requestValidator from '@/middlewares/request-validator';

const router = Router({ mergeParams: true });



/**
 * @swagger
 * /chats/mute:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Silenciar chat
 *     description: Silencia un chat por un tiempo determinado
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
 *                 description: JID del chat
 *               duration:
 *                 type: number
 *                 description: Duración del silencio en milisegundos
 *     responses:
 *       200:
 *         description: Chat silenciado exitosamente
 */
router.post(
	'/mute',
	body('jid').isString().notEmpty(),
	body('duration').isNumeric().notEmpty(),
	requestValidator,
	chat.mute,
);

/**
 * @swagger
 * /chats/read:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Marcar como leído
 *     description: Marca mensajes como leídos
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
 *                 description: JID del chat
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de IDs de mensajes a marcar como leídos
 *     responses:
 *       200:
 *         description: Mensajes marcados como leídos exitosamente
 */
router.post(
	'/read',
	body('jid').isString().notEmpty(),
	body('messageIds').isArray().notEmpty(),
	requestValidator,
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
 *                 description: JID del chat
 *               duration:
 *                 type: number
 *                 description: Duración de los mensajes en segundos (0 para desactivar)
 *     responses:
 *       200:
 *         description: Configuración actualizada exitosamente
 */
router.post(
	'/disappearing',
	body('jid').isString().notEmpty(),
	body('duration').isNumeric().optional(),
	requestValidator,
	chat.setDisappearing,
);

export default router;
