import { Router } from "express";
import { body, param } from "express-validator";
import { webhook } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /webhooks:
 *   get:
 *     tags:
 *       - Webhooks
 *     summary: Listar webhooks
 *     description: Obtiene la lista de todos los webhooks configurados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de webhooks obtenida exitosamente
 *       401:
 *         description: No autorizado
 */
router.get("/", sessionValidator, webhook.list);

/**
 * @swagger
 * /webhooks:
 *   post:
 *     tags:
 *       - Webhooks
 *     summary: Crear webhook
 *     description: Crea un nuevo webhook para recibir notificaciones
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL del webhook donde se enviarán las notificaciones
 *     responses:
 *       201:
 *         description: Webhook creado exitosamente
 *       400:
 *         description: URL inválida
 */
router.post(
	"/",
	body("url").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.create,
);

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     tags:
 *       - Webhooks
 *     summary: Actualizar webhook
 *     description: Actualiza la URL de un webhook existente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del webhook
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: Nueva URL del webhook
 *     responses:
 *       200:
 *         description: Webhook actualizado exitosamente
 *       400:
 *         description: ID o URL inválidos
 *       404:
 *         description: Webhook no encontrado
 */
router.put(
	"/:id",
	param("id").isNumeric().notEmpty(),
	body("url").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.update,
);

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     tags:
 *       - Webhooks
 *     summary: Eliminar webhook
 *     description: Elimina un webhook existente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del webhook a eliminar
 *     responses:
 *       200:
 *         description: Webhook eliminado exitosamente
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Webhook no encontrado
 */
router.delete(
	"/:id",
	param("id").isNumeric().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.remove,
);

export default router;
