import { Router } from "express";
import { body, param, query } from "express-validator";
import { webhook } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";

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
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de webhooks obtenida exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: API key faltante o inválida
 */
router.get("/", webhook.list);

/**
 * @swagger
 * /webhooks/check:
 *   get:
 *     tags:
 *       - Webhooks
 *     summary: Check if webhook exists by URL and type
 *     description: Verifies if a webhook with the given URL and optional type exists for the current session
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL of the webhook to check
 *       - in: query
 *         name: webhookType
 *         required: false
 *         schema:
 *           type: string
 *         description: Type of the webhook to check
 *     responses:
 *       200:
 *         description: Returns the webhooks that match the criteria
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Webhook'
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Invalid API key
 */
router.get(
	"/check",
	query("url").isString().notEmpty(),
	query("webhookType").optional().isString().notEmpty(),
	requestValidator,
	webhook.checkByUrl,
);

/**
 * @swagger
 * /webhooks:
 *   post:
 *     tags:
 *       - Webhooks
 *     summary: Crear webhook
 *     description: Crea un nuevo webhook para recibir notificaciones
 *     security:
 *       - ApiKeyAuth: []
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
 *               webhookType:
 *                 type: string
 *                 description: Tipo de webhook. Defaults to "messages.upsert".
 *     responses:
 *       201:
 *         description: Webhook creado exitosamente
 *       400:
 *         description: URL inválida
 *       403:
 *         description: API key faltante o inválida
 */
router.post(
	"/",
	body("url").isString().notEmpty(),
	body("webhookType").optional().isString(),
	requestValidator,
	webhook.create,
);

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     tags:
 *       - Webhooks
 *     summary: Actualizar webhook
 *     description: Actualiza la URL y/o el tipo de un webhook existente.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del webhook
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: Nueva URL del webhook
 *               webhookType:
 *                 type: string
 *                 description: Nuevo tipo del webhook
 *     responses:
 *       200:
 *         description: Webhook actualizado exitosamente
 *       400:
 *         description: ID o URL inválidos, o ningún campo para actualizar.
 *       403:
 *         description: API key faltante o inválida
 *       404:
 *         description: Webhook no encontrado
 */
router.put(
	"/:id",
	param("id").isString().notEmpty(),
	body("url").optional().isString().notEmpty(),
	body("webhookType").optional().isString(),
	requestValidator,
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
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del webhook a eliminar
 *     responses:
 *       200:
 *         description: Webhook eliminado exitosamente
 *       400:
 *         description: ID inválido
 *       403:
 *         description: API key faltante o inválida
 *       404:
 *         description: Webhook no encontrado
 */
router.delete("/:id", param("id").isString().notEmpty(), requestValidator, webhook.remove);

export default router;
