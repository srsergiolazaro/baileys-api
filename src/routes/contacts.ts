import { Router } from "express";
import { body, query } from "express-validator";
import { contact } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /contacts:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Listar contactos
 *     description: Obtiene una lista paginada de todos los contactos
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
 *         description: Límite de contactos a retornar
 *     responses:
 *       200:
 *         description: Lista de contactos obtenida exitosamente
 *       400:
 *         description: Parámetros de consulta inválidos
 */
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	contact.list,
);

/**
 * @swagger
 * /contacts/blocklist:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Obtener lista de bloqueados
 *     description: Obtiene la lista de contactos bloqueados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de contactos bloqueados obtenida exitosamente
 *       401:
 *         description: No autorizado
 */
router.get("/blocklist", sessionValidator, contact.listBlocked);

/**
 * @swagger
 * /contacts/blocklist/update:
 *   post:
 *     tags:
 *       - Contactos
 *     summary: Actualizar estado de bloqueo
 *     description: Bloquea o desbloquea un contacto
 *     security:
 *       - BearerAuth: []
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
 *                 description: ID del contacto (JID)
 *               action:
 *                 type: string
 *                 enum: [block, unblock]
 *                 description: Acción a realizar
 *     responses:
 *       200:
 *         description: Estado de bloqueo actualizado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/blocklist/update",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["block", "unblock"]).optional(),
	requestValidator,
	sessionValidator,
	contact.updateBlock,
);

/**
 * @swagger
 * /contacts/{jid}:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Verificar contacto
 *     description: Verifica si un número está registrado en WhatsApp
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del contacto (JID)
 *     responses:
 *       200:
 *         description: Contacto verificado exitosamente
 *       404:
 *         description: Contacto no encontrado
 */
router.get("/:jid", sessionValidator, contact.check);

/**
 * @swagger
 * /contacts/{jid}/photo:
 *   get:
 *     tags:
 *       - Contactos
 *     summary: Obtener foto de perfil
 *     description: Obtiene la foto de perfil de un contacto
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del contacto (JID)
 *     responses:
 *       200:
 *         description: Foto de perfil obtenida exitosamente
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Foto de perfil no encontrada
 */
router.get("/:jid/photo", sessionValidator, contact.photo);

export default router;
