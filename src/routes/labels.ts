import { Router } from "express";
import { body } from "express-validator";
import { label } from "../controllers";
import requestValidator from "@/middlewares/request-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /labels:
 *   post:
 *     tags:
 *       - Labels
 *     summary: Crear o actualizar etiqueta
 *     description: Crea una nueva etiqueta o actualiza una existente
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *             properties:
 *               label:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: ID de la etiqueta (opcional para nuevas)
 *                   name:
 *                     type: string
 *                     description: Nombre de la etiqueta
 *                   color:
 *                     type: number
 *                     description: Color de la etiqueta (0-20)
 *                   predefinedId:
 *                     type: number
 *                     description: ID predefinido (opcional)
 *     responses:
 *       200:
 *         description: Etiqueta procesada exitosamente
 * /labels:
 *   get:
 *     tags:
 *       - Labels
 *     summary: Listar todas las etiquetas
 *     description: Obtiene la lista actual de etiquetas para la sesión
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de etiquetas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 *                   color: { type: number }
 *                   deleted: { type: boolean }
 *                   predefinedId: { type: string }
 */
router.get("/", label.list);

router.post(
    "/",
    body("label").isObject().notEmpty(),
    requestValidator,
    label.add,
);

/**
 * @swagger
 * /labels/add-chat:
 *   post:
 *     tags:
 *       - Labels
 *     summary: Agregar chat a etiqueta
 *     description: Asocia un chat con una etiqueta específica
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
 *               - labelId
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del chat
 *               labelId:
 *                 type: string
 *                 description: ID de la etiqueta
 *     responses:
 *       200:
 *         description: Chat etiquetado exitosamente
 */
router.post(
    "/add-chat",
    body("jid").isString().notEmpty(),
    body("labelId").isString().notEmpty(),
    requestValidator,
    label.addChat,
);

/**
 * @swagger
 * /labels/remove-chat:
 *   post:
 *     tags:
 *       - Labels
 *     summary: Remover chat de etiqueta
 *     description: Elimina la asociación de un chat con una etiqueta específica
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
 *               - labelId
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del chat
 *               labelId:
 *                 type: string
 *                 description: ID de la etiqueta
 *     responses:
 *       200:
 *         description: Etiqueta removida del chat exitosamente
 */
router.post(
    "/remove-chat",
    body("jid").isString().notEmpty(),
    body("labelId").isString().notEmpty(),
    requestValidator,
    label.removeChat,
);

export default router;
