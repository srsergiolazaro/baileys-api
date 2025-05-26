import { Router } from "express";
import { product } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { body } from "express-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /products/list:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Listar productos
 *     description: Obtiene la lista de productos de un negocio
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
 *                 description: ID del negocio (JID)
 *     responses:
 *       200:
 *         description: Lista de productos obtenida exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post("/list", body("jid").isString(), requestValidator, sessionValidator, product.list);

/**
 * @swagger
 * /products/create:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Crear producto
 *     description: Crea un nuevo producto en el catálogo
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - currency
 *               - description
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del producto
 *               currency:
 *                 type: string
 *                 description: Código de moneda (ej. USD, EUR)
 *               description:
 *                 type: string
 *                 description: Descripción del producto
 *               price:
 *                 type: number
 *                 description: Precio del producto
 *               url:
 *                 type: string
 *                 description: URL del producto
 *               isHidden:
 *                 type: boolean
 *                 description: Si el producto está oculto
 *               retailerId:
 *                 type: string
 *                 description: ID del vendedor
 *               originCountryCode:
 *                 type: string
 *                 description: Código del país de origen
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: URLs de las imágenes del producto
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/create",
	body("name").isString().notEmpty(),
	body("currency").isString().notEmpty(),
	body("description").isString().notEmpty(),
	body("price").isNumeric().notEmpty(),
	body("url").isString().optional(),
	body("isHidden").isBoolean().optional(),
	body("retailerId").isString().optional(),
	body("originCountryCode").isString().optional(),
	body("images").isArray().optional(),
	requestValidator,
	sessionValidator,
	product.create,
);

/**
 * @swagger
 * /products/delete:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Eliminar productos
 *     description: Elimina uno o varios productos del catálogo
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productIds
 *             properties:
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de IDs de productos a eliminar
 *     responses:
 *       200:
 *         description: Productos eliminados exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/delete",
	body("productIds").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	product.deleteRoute,
);

/**
 * @swagger
 * /products/update:
 *   put:
 *     tags:
 *       - Productos
 *     summary: Actualizar producto
 *     description: Actualiza la información de un producto existente
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - update
 *             properties:
 *               productId:
 *                 type: string
 *                 description: ID del producto a actualizar
 *               update:
 *                 type: object
 *                 required:
 *                   - name
 *                   - description
 *                   - price
 *                   - currency
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Nuevo nombre del producto
 *                   description:
 *                     type: string
 *                     description: Nueva descripción del producto
 *                   price:
 *                     type: number
 *                     description: Nuevo precio del producto
 *                   currency:
 *                     type: string
 *                     description: Nuevo código de moneda
 *                   url:
 *                     type: string
 *                     description: Nueva URL del producto
 *                   isHidden:
 *                     type: boolean
 *                     description: Si el producto debe estar oculto
 *                   retailerId:
 *                     type: string
 *                     description: Nuevo ID del vendedor
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Nuevas URLs de las imágenes del producto
 *     responses:
 *       200:
 *         description: Producto actualizado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Producto no encontrado
 */
router.put(
	"/update",
	body("productId").isString().notEmpty(),
	body("update").isObject().notEmpty(),
	body("update.name").isString().notEmpty(),
	body("update.description").isString().notEmpty(),
	body("update.price").isNumeric().notEmpty(),
	body("update.currency").isString().notEmpty(),
	body("update.url").isString().optional(),
	body("update.isHidden").isBoolean().optional(),
	body("update.retailerId").isString().optional(),
	body("update.images").isArray().optional(),
	requestValidator,
	sessionValidator,
	product.update,
);

/**
 * @swagger
 * /products/collections:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Obtener colecciones
 *     description: Obtiene las colecciones de productos de un negocio
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del negocio (JID)
 *               limit:
 *                 type: number
 *                 description: Límite de productos por colección
 *     responses:
 *       200:
 *         description: Colecciones obtenidas exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/collections",
	body("jid").isString().optional(),
	body("limit").isNumeric().optional(),
	requestValidator,
	sessionValidator,
	product.getCollections,
);

/**
 * @swagger
 * /products/order-details:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Obtener detalles de orden
 *     description: Obtiene los detalles de una orden específica
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - token
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: ID de la orden
 *               token:
 *                 type: string
 *                 description: Token de autenticación
 *     responses:
 *       200:
 *         description: Detalles de la orden obtenidos exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/order-details",
	body("orderId").isString().notEmpty(),
	body("token").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	product.getOrderDetails,
);

/**
 * @swagger
 * /products/send-message:
 *   post:
 *     tags:
 *       - Productos
 *     summary: Enviar mensaje con producto
 *     description: Envía un mensaje que incluye información de un producto
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
 *               - product
 *             properties:
 *               jid:
 *                 type: string
 *                 description: ID del destinatario (JID)
 *               product:
 *                 type: object
 *                 required:
 *                   - productImage
 *                   - title
 *                   - description
 *                   - currencyCode
 *                   - priceAmount1000
 *                 properties:
 *                   productImage:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         description: URL de la imagen del producto
 *                   title:
 *                     type: string
 *                     description: Título del producto
 *                   description:
 *                     type: string
 *                     description: Descripción del producto
 *                   currencyCode:
 *                     type: string
 *                     description: Código de la moneda
 *                   priceAmount1000:
 *                     type: number
 *                     description: Precio en la unidad más pequeña (centavos)
 *                   retailerId:
 *                     type: string
 *                     description: ID del vendedor
 *                   url:
 *                     type: string
 *                     description: URL del producto
 *               options:
 *                 type: object
 *                 description: Opciones adicionales para el mensaje
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 */
router.post(
	"/send-message",
	body("jid").isString().notEmpty(),
	body("product").isObject().notEmpty(),
	body("product.productImage").isObject().notEmpty(),
	body("product.productImage.url").isString().notEmpty(),
	body("product.title").isString().notEmpty(),
	body("product.description").isString().notEmpty(),
	body("product.currencyCode").isString().notEmpty(),
	body("product.priceAmount1000").isNumeric().notEmpty(),
	body("product.retailerId").isString().optional(),
	body("product.url").isString().optional(),
	body("options").isObject().optional(),
	requestValidator,
	sessionValidator,
	product.sendProductMessage,
);

export default router;
