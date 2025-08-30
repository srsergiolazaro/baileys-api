import { Router } from "express";
import { body } from "express-validator";
import { user } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /user/block:
 *   post:
 *     tags:
 *       - User
 *     summary: Bloquear un contacto
 *     description: Bloquea un contacto de whatsapp
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
 *                 description: ID del contacto (JID)
 *     responses:
 *       200:
 *         description: Contacto bloqueado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/block",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	user.block,
);

/**
 * @swagger
 * /user/unblock:
 *   post:
 *     tags:
 *       - User
 *     summary: Desbloquear un contacto
 *     description: Desbloquea un contacto de whatsapp
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
 *                 description: ID del contacto (JID)
 *     responses:
 *       200:
 *         description: Contacto desbloqueado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/unblock",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	user.unblock,
);

/**
 * @swagger
 * /user/update-profile-picture:
 *   post:
 *     tags:
 *       - User
 *     summary: Update or remove profile picture
 *     description: Update the profile picture for a user or remove it if no URL is provided
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
 *                 description: JID of the user/group
 *               url:
 *                 type: string
 *                 description: URL of the new profile picture (leave empty to remove current picture)
 *     responses:
 *       200:
 *         description: Profile picture updated/removed successfully
 *       400:
 *         description: JID is required
 */
router.post(
	"/update-profile-picture",
	body("jid").isString().notEmpty(),
	body("url").optional().isString(),
	requestValidator,
	sessionValidator,
	user.updateProfilePicture,
);

export default router;
