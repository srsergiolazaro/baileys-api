import { Router } from "express";
import { key } from "@/controllers";
import { userValidator } from "@/middlewares/user-validator";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

const router = Router();



/**
 *
 * @swagger
 * tags:
 *   name: API Keys
 *   description: API Key management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated ID of the API key
 *           example: clx0z0z0z0000000000000000
 *         key:
 *           type: string
 *           description: The hashed API key (only returned on creation)
 *           example: $2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmno
 *         plainKey:
 *           type: string
 *           description: The plain API key (only returned on creation)
 *           example: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
 *         userId:
 *           type: string
 *           description: The ID of the user associated with the API key
 *           example: user_123abc
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the API key was created
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the API key expires (optional)
 *         enabled:
 *           type: boolean
 *           description: Whether the API key is enabled or disabled
 *           example: true
 */

/**
 * @swagger
 * /keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user to associate with the API key
 *                 example: user_123abc
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional expiration date for the API key
 *               enabled:
 *                 type: boolean
 *                 description: Optional status for the API key (default true)
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       400:
 *         description: Bad request (e.g., missing userId)
 *       500:
 *         description: Internal server error
 */
router.post("/", userValidator, key.create);

/**
 * @swagger
 * /keys:
 *   get:
 *     summary: Get all API keys (optionally filtered by userId)
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter API keys by user ID
 *     responses:
 *       200:
 *         description: A list of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 *       500:
 *         description: Internal server error
 */
router.get("/", userValidator, key.findAll);

/**
 * @swagger
 * /keys/{id}:
 *   get:
 *     summary: Get an API key by ID
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the API key to retrieve
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       404:
 *         description: API Key not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", key.findOne);

/**
 * @swagger
 * /keys/{id}:
 *   put:
 *     summary: Update an API key by ID
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the API key to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: New expiration date for the API key
 *               enabled:
 *                 type: boolean
 *                 description: New status for the API key
 *     responses:
 *       200:
 *         description: API key updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       404:
 *         description: API Key not found
 *       500:
 *         description: Internal server error
 */
router.put("/:id", key.update);

/**
 * @swagger
 * /keys/{id}:
 *   delete:
 *     summary: Delete an API key by ID
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the API key to delete
 *     responses:
 *       204:
 *         description: API key deleted successfully
 *       404:
 *         description: API Key not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", key.remove);

export default router;
