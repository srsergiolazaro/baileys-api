import { Router } from 'express';
import { body, query } from 'express-validator';
import { contact } from '@/controllers';
import requestValidator from '@/middlewares/request-validator';
import jidValidator from '@/middlewares/jid-validator';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /contacts:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Listar contactos
 *     description: Obtiene la lista de contactos
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
 *         description: Lista de contactos obtenida exitosamente
 */
router.get(
	'/',
	query('cursor').isNumeric().optional(),
	query('limit').isNumeric().optional(),
	requestValidator,
	contact.list,
);

/**
 * @swagger
 * /contacts/blocklist:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Listar bloqueados
 *     description: Obtiene la lista de contactos bloqueados
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de contactos bloqueados obtenida exitosamente
 */
router.get('/blocklist', contact.listBlocked);

/**
 * @swagger
 * /contacts/blocklist/update:
 *   post:
 *     tags:
 *       - Contactos
 *     summary: Actualizar bloqueo
 *     description: Bloquea o desbloquea un contacto
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
 *                 description: JID del contacto
 *               action:
 *                 type: string
 *                 enum: [block, unblock]
 *                 description: Acción a realizar
 *     responses:
 *       200:
 *         description: Estado de bloqueo actualizado exitosamente
 */
router.post(
	'/blocklist/update',
	body('jid').isString().notEmpty(),
	body('action').isString().isIn(['block', 'unblock']).optional(),
	requestValidator,
	contact.updateBlock,
);

/**
 * @swagger
 * /contacts/{jid}:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Verificar contacto
 *     description: Verifica si un JID es un contacto válido en WhatsApp
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: JID del contacto
 *     responses:
 *       200:
 *         description: Información del contacto obtenida exitosamente
 *       404:
 *         description: Contacto no encontrado
 */
router.get('/:jid', jidValidator, contact.check);

/**
 * @swagger
 * /contacts/{jid}/photo:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Foto de contacto
 *     description: Obtiene la URL de la foto de perfil de un contacto
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: JID del contacto
 *     responses:
 *       200:
 *         description: URL de la foto obtenida exitosamente
 *       404:
 *         description: Foto no encontrada
 */
router.get('/:jid/photo', contact.photo);

export default router;
