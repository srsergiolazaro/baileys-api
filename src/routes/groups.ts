import { Router } from "express";
import { query, body } from "express-validator";
import { group } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /groups:
 *   get:
 *     tags:
 *       - Grupos
 *     summary: Listar grupos
 *     description: Obtiene la lista de grupos
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
 *         description: Lista de grupos obtenida exitosamente
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
 * /groups/search:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Buscar grupo
 *     description: Busca un grupo por nombre
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del grupo a buscar
 *     responses:
 *       200:
 *         description: Grupos encontrados exitosamente
 */
router.post("/search", body("name").isString().optional(), requestValidator, group.search);

/**
 * @swagger
 * /groups/find:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Encontrar grupo
 *     description: Obtiene información de un grupo por JID
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
 *                 description: JID del grupo
 *     responses:
 *       200:
 *         description: Información del grupo obtenida exitosamente
 *       404:
 *         description: Grupo no encontrado
 */
router.post("/find", body("jid").isString().notEmpty(), requestValidator, group.find);

/**
 * @swagger
 * /groups/{jid}/photo:
 *   get:
 *     tags:
 *       - Grupos
 *     summary: Foto de grupo
 *     description: Obtiene la foto de perfil del grupo
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: JID del grupo
 *     responses:
 *       200:
 *         description: Foto del grupo obtenida exitosamente
 *       404:
 *         description: Foto no encontrada
 */
router.get("/:jid/photo", group.photo);

/**
 * @swagger
 * /groups/{jid}/invite-code:
 *   get:
 *     tags:
 *       - Grupos
 *     summary: Código de invitación
 *     description: Obtiene el código de invitación del grupo
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: JID del grupo
 *     responses:
 *       200:
 *         description: Código de invitación obtenido exitosamente
 */
router.get("/:jid/invite-code", group.inviteCode);

/**
 * @swagger
 * /groups:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Crear grupo
 *     description: Crea un nuevo grupo
 *     security:
 *       - ApiKeyAuth: []
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
 *                 description: Asunto/Título del grupo
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de JIDs de los participantes
 *     responses:
 *       200:
 *         description: Grupo creado exitosamente
 */
router.post(
	"/",
	body("subject").isString().notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	group.create,
);

/**
 * @swagger
 * /groups/update:
 *   put:
 *     tags:
 *       - Grupos
 *     summary: Actualizar grupo
 *     description: Actualiza el asunto de un grupo
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
 *                 description: JID del grupo
 *               subject:
 *                 type: string
 *                 description: Nuevo asunto del grupo
 *     responses:
 *       200:
 *         description: Grupo actualizado exitosamente
 */
router.put(
	"/update",
	body("jid").isString().notEmpty(),
	body("subject").isString().optional(),
	requestValidator,
	group.update,
);

/**
 * @swagger
 * /groups/delete:
 *   delete:
 *     tags:
 *       - Grupos
 *     summary: Eliminar grupo
 *     description: Elimina un grupo (solo si eres admin)
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
 *                 description: JID del grupo a eliminar
 *     responses:
 *       200:
 *         description: Grupo eliminado exitosamente
 */
router.delete("/delete", body("jid").isString().notEmpty(), requestValidator, group.deleteGroup);

/**
 * @swagger
 * /groups/participants:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Actualizar participantes
 *     description: Añade, elimina, promueve o degrada participantes en un grupo
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
 *               - action
 *               - participants
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del grupo
 *               action:
 *                 type: string
 *                 enum: [add, remove, promote, demote]
 *                 description: Acción a realizar
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de JIDs de los participantes afectados
 *     responses:
 *       200:
 *         description: Participantes actualizados exitosamente
 */
router.post(
	"/participants",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["add", "remove", "promote", "demote"]).notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	group.updateParticipants,
);

/**
 * @swagger
 * /groups/settings:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Actualizar configuración
 *     description: Actualiza la configuración del grupo
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
 *               - settings
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del grupo
 *               settings:
 *                 type: string
 *                 enum: [announcement, not_announcement, locked, unlocked]
 *                 description: Configuración a aplicar
 *     responses:
 *       200:
 *         description: Configuración actualizada exitosamente
 */
router.post(
	"/settings",
	body("jid").isString().notEmpty(),
	body("settings").isString().notEmpty(),
	requestValidator,
	group.updateSettings,
);

router.post(
	"/member-add-mode",
	body("jid").isString().notEmpty(),
	body("mode").isString().isIn(["all_member_add", "admin_add"]).notEmpty(),
	requestValidator,
	group.memberAddMode,
);

/**
 * @swagger
 * /groups/leave:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Salir del grupo
 *     description: Abandona un grupo
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
 *                 description: JID del grupo
 *     responses:
 *       200:
 *         description: Grupo abandonado exitosamente
 */
router.post("/leave", body("jid").isString().notEmpty(), requestValidator, group.leaveGroup);

/**
 * @swagger
 * /groups/update-subject:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Actualizar asunto
 *     description: Actualiza el asunto (título) del grupo
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
 *               - subject
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del grupo
 *               subject:
 *                 type: string
 *                 description: Nuevo asunto
 *     responses:
 *       200:
 *         description: Asunto actualizado exitosamente
 */
router.post(
	"/update-subject",
	body("jid").isString().notEmpty(),
	body("subject").isString().notEmpty(),
	requestValidator,
	group.updateSubject,
);

/**
 * @swagger
 * /groups/update-description:
 *   post:
 *     tags:
 *       - Grupos
 *     summary: Actualizar descripción
 *     description: Actualiza la descripción del grupo
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
 *               - description
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del grupo
 *               description:
 *                 type: string
 *                 description: Nueva descripción
 *     responses:
 *       200:
 *         description: Descripción actualizada exitosamente
 */
router.post(
	"/update-description",
	body("jid").isString().notEmpty(),
	body("description").isString().notEmpty(),
	requestValidator,
	group.updateDescription,
);

export default router;
