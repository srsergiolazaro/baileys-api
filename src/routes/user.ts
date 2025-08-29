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

export default router;
