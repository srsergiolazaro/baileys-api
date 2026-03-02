import { Router } from 'express';
import { body } from 'express-validator';
import { newsletter } from '@/controllers';
import requestValidator from '@/middlewares/request-validator';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /newsletters:
 *   post:
 *     tags:
 *       - Newsletters
 *     summary: Crear newsletter
 *     description: Crea un nuevo canal/newsletter de WhatsApp
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del newsletter
 *               description:
 *                 type: string
 *                 description: Descripción del newsletter
 *     responses:
 *       201:
 *         description: Newsletter creado exitosamente
 *       500:
 *         description: Error al crear el newsletter
 */
router.post(
	'/',
	body('name').isString().notEmpty(),
	body('description').isString().optional(),
	requestValidator,
	newsletter.create,
);

/**
 * @swagger
 * /newsletters/metadata:
 *   post:
 *     tags:
 *       - Newsletters
 *     summary: Obtener metadatos
 *     description: Obtiene los metadatos de un newsletter
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
 *                 description: JID del newsletter (@newsletter)
 *     responses:
 *       200:
 *         description: Metadatos obtenidos exitosamente
 *       500:
 *         description: Error al obtener metadatos
 */
router.post('/metadata', body('jid').isString().notEmpty(), requestValidator, newsletter.metadata);

/**
 * @swagger
 * /newsletters/subscribe:
 *   post:
 *     tags:
 *       - Newsletters
 *     summary: Suscribirse
 *     description: Suscribirse a un newsletter
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
 *                 description: JID del newsletter (@newsletter)
 *     responses:
 *       200:
 *         description: Suscripción exitosa
 *       500:
 *         description: Error al suscribirse
 */
router.post(
	'/subscribe',
	body('jid').isString().notEmpty(),
	requestValidator,
	newsletter.subscribe,
);

/**
 * @swagger
 * /newsletters/unsubscribe:
 *   post:
 *     tags:
 *       - Newsletters
 *     summary: Cancelar suscripción
 *     description: Cancelar suscripción a un newsletter
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
 *                 description: JID del newsletter (@newsletter)
 *     responses:
 *       200:
 *         description: Cancelación exitosa
 *       500:
 *         description: Error al cancelar suscripción
 */
router.post(
	'/unsubscribe',
	body('jid').isString().notEmpty(),
	requestValidator,
	newsletter.unsubscribe,
);

/**
 * @swagger
 * /newsletters/send:
 *   post:
 *     tags:
 *       - Newsletters
 *     summary: Enviar mensaje
 *     description: Envía un mensaje de texto al newsletter (solo si eres admin)
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
 *               - text
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del newsletter (@newsletter)
 *               text:
 *                 type: string
 *                 description: Texto del mensaje
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *       500:
 *         description: Error al enviar mensaje
 */
router.post(
	'/send',
	body('jid').isString().notEmpty(),
	body('text').isString().notEmpty(),
	requestValidator,
	newsletter.send,
);

export default router;
