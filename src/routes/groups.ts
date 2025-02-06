import { Router } from "express";
import { query, body } from "express-validator";
import { group } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /groups:
 *   get:
 *     tags:
 *       - Grupos
 *     summary: Listar grupos
 *     description: Obtiene una lista paginada de grupos
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
 *         description: Límite de grupos a retornar
 *     responses:
 *       200:
 *         description: Lista de grupos obtenida exitosamente
 *       400:
 *         description: Parámetros de consulta inválidos
 */
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	group.list,
);

/**
 * @swagger
 * /groups/find:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Buscar grupo
 *     description: Busca un grupo específico por su JID
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
 *                 description: ID del grupo (JID)
 *     responses:
 *       200:
 *         description: Grupo encontrado exitosamente
 *       404:
 *         description: Grupo no encontrado
 */
router.post(
	"/find",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.find,
);

/**
 * @swagger
 * /groups/{jid}/photo:
 *   get:
 *     tags:
 *       - Grupos
 *     summary: Obtener foto del grupo
 *     description: Obtiene la foto de perfil del grupo
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo (JID)
 *     responses:
 *       200:
 *         description: Foto del grupo obtenida exitosamente
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Foto no encontrada
 */
router.get("/:jid/photo", sessionValidator, group.photo);

/**
 * @swagger
 * /groups:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Crear grupo
 *     description: Crea un nuevo grupo de WhatsApp
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - participants
 *             properties:
 *               subject:
 *                 type: string
 *                 description: Nombre del grupo
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de números de teléfono de los participantes
 *     responses:
 *       201:
 *         description: Grupo creado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/",
	body("subject").isString().notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	group.create,
);

/**
 * @swagger
 * /groups/update:
 *   put:
 *     tags:
 *       - Grupos
 *     summary: Actualizar grupo
 *     description: Actualiza la información de un grupo existente
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
 *                 description: ID del grupo (JID)
 *               subject:
 *                 type: string
 *                 description: Nuevo nombre del grupo
 *     responses:
 *       200:
 *         description: Grupo actualizado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Grupo no encontrado
 */
router.put(
	"/update",
	body("jid").isString().notEmpty(),
	body("subject").isString().optional(),
	requestValidator,
	sessionValidator,
	group.update,
);

/**
 * @swagger
 * /groups/delete:
 *   delete:
 *     tags:
 *       - Grupos
 *     summary: Eliminar grupo
 *     description: Elimina un grupo existente
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
 *                 description: ID del grupo (JID)
 *     responses:
 *       200:
 *         description: Grupo eliminado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Grupo no encontrado
 */
router.delete(
	"/delete",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.deleteGroup,
);

/**
 * @swagger
 * /groups/participants:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Gestionar participantes
 *     description: Añade, elimina, promueve o degrada participantes del grupo
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
 *               - action
 *               - participants
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del grupo (JID)
 *               action:
 *                 type: string
 *                 enum: [add, remove, promote, demote]
 *                 description: Acción a realizar con los participantes
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de números de teléfono de los participantes
 *     responses:
 *       200:
 *         description: Participantes actualizados exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Grupo no encontrado
 */
router.post(
	"/participants",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["add", "remove", "promote", "demote"]).notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	group.updateParticipants,
);

/**
 * @swagger
 * /groups/settings:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Actualizar configuración del grupo
 *     description: Actualiza la configuración de un grupo existente
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
 *               - settings
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del grupo (JID)
 *               settings:
 *                 type: string
 *                 description: Configuración a actualizar
 *     responses:
 *       200:
 *         description: Configuración actualizada exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Grupo no encontrado
 */
router.post(
	"/settings",
	body("jid").isString().notEmpty(),
	body("settings").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.updateSettings,
);

export default router;
