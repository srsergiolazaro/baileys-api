import { Router } from "express";
import { product } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import { body } from "express-validator";

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /products/list:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Obtener catálogo de productos
 *     description: |
 *       Obtiene el catálogo de productos de un negocio de WhatsApp Business.
 *       Soporta paginación mediante cursor.
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
 *                 description: JID del negocio (número@s.whatsapp.net)
 *                 example: "5491112345678@s.whatsapp.net"
 *               limit:
 *                 type: number
 *                 description: Cantidad máxima de productos a retornar
 *                 default: 10
 *                 example: 20
 *               cursor:
 *                 type: string
 *                 description: Cursor para paginación (obtenido de respuesta anterior)
 *           example:
 *             jid: "5491112345678@s.whatsapp.net"
 *             limit: 10
 *     responses:
 *       200:
 *         description: Catálogo obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: ID único del producto
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       price:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       isHidden:
 *                         type: boolean
 *                       images:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             url:
 *                               type: string
 *                 nextPageCursor:
 *                   type: string
 *                   description: Cursor para la siguiente página (null si no hay más)
 *             example:
 *               products:
 *                 - id: "1234567890"
 *                   name: "Producto de ejemplo"
 *                   description: "Descripción del producto"
 *                   price: 9900
 *                   currency: "USD"
 *                   isHidden: false
 *                   images:
 *                     - url: "https://example.com/image.jpg"
 *               nextPageCursor: "abc123"
 *       400:
 *         description: JID inválido o no existe
 *         content:
 *           application/json:
 *             example:
 *               error: "JID does not exist"
 *       404:
 *         description: Sesión no encontrada
 *         content:
 *           application/json:
 *             example:
 *               error: "Session not found"
 */
router.post("/list", body("jid").isString(), requestValidator, product.list);

/**
 * @swagger
 * /products/collections:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Obtener colecciones de productos
 *     description: |
 *       Obtiene las colecciones de productos de un negocio.
 *       Las colecciones son agrupaciones de productos organizadas por el negocio.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jid:
 *                 type: string
 *                 description: JID del negocio. Si no se especifica, usa el JID de la sesión actual
 *                 example: "5491112345678@s.whatsapp.net"
 *               limit:
 *                 type: number
 *                 description: Límite de colecciones/items a retornar
 *                 default: 51
 *                 example: 20
 *           example:
 *             jid: "5491112345678@s.whatsapp.net"
 *             limit: 20
 *     responses:
 *       200:
 *         description: Colecciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       products:
 *                         type: array
 *                         items:
 *                           type: object
 *             example:
 *               collections:
 *                 - id: "collection_123"
 *                   name: "Ofertas de verano"
 *                   products:
 *                     - id: "prod_1"
 *                       name: "Producto 1"
 *       400:
 *         description: JID inválido
 *       404:
 *         description: Sesión no encontrada
 */
router.post(
	"/collections",
	body("jid").isString().optional(),
	body("limit").isNumeric().optional(),
	requestValidator,
	product.getCollections,
);

/**
 * @swagger
 * /products/create:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Crear nuevo producto
 *     description: |
 *       Crea un nuevo producto en el catálogo de WhatsApp Business.
 *       El producto se guarda tanto en WhatsApp como en la base de datos local.
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
 *                 description: Nombre del producto (máx. 70 caracteres)
 *                 example: "Camiseta Premium"
 *               description:
 *                 type: string
 *                 description: Descripción detallada del producto
 *                 example: "Camiseta 100% algodón, disponible en varios colores"
 *               price:
 *                 type: number
 *                 description: Precio en la unidad más pequeña (centavos). Ej. 9900 = $99.00
 *                 example: 9900
 *               currency:
 *                 type: string
 *                 description: Código ISO de moneda
 *                 example: "USD"
 *               url:
 *                 type: string
 *                 description: URL externa del producto
 *                 example: "https://mitienda.com/productos/camiseta-premium"
 *               isHidden:
 *                 type: boolean
 *                 description: Si el producto está oculto del catálogo público
 *                 default: false
 *                 example: false
 *               retailerId:
 *                 type: string
 *                 description: SKU o ID interno del vendedor
 *                 example: "SKU-12345"
 *               originCountryCode:
 *                 type: string
 *                 description: Código ISO del país de origen
 *                 example: "AR"
 *               images:
 *                 type: array
 *                 description: Lista de imágenes del producto
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       description: URL de la imagen (debe ser accesible públicamente)
 *                 example:
 *                   - url: "https://example.com/imagen1.jpg"
 *                   - url: "https://example.com/imagen2.jpg"
 *           example:
 *             name: "Camiseta Premium"
 *             description: "Camiseta 100% algodón, disponible en varios colores"
 *             price: 9900
 *             currency: "USD"
 *             url: "https://mitienda.com/productos/camiseta"
 *             isHidden: false
 *             retailerId: "SKU-12345"
 *             originCountryCode: "AR"
 *             images:
 *               - url: "https://example.com/imagen1.jpg"
 *     responses:
 *       200:
 *         description: Producto creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 productRes:
 *                   type: object
 *                   description: Respuesta de WhatsApp con el producto creado
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: ID del producto en WhatsApp
 *                 savedProduct:
 *                   type: object
 *                   description: Producto guardado en base de datos local
 *             example:
 *               message: "Product created"
 *               productRes:
 *                 id: "1234567890"
 *                 name: "Camiseta Premium"
 *               savedProduct:
 *                 id: 1
 *                 productId: "1234567890"
 *                 name: "Camiseta Premium"
 *                 price: 9900
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Sesión no encontrada
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
	product.create,
);

/**
 * @swagger
 * /products/update:
 *   put:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Actualizar producto existente
 *     description: |
 *       Actualiza la información de un producto existente en el catálogo.
 *       Actualiza tanto en WhatsApp como en la base de datos local.
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
 *                 description: ID del producto en WhatsApp (obtenido al crear o listar)
 *                 example: "1234567890"
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
 *                     example: "Camiseta Premium v2"
 *                   description:
 *                     type: string
 *                     example: "Nueva descripción mejorada"
 *                   price:
 *                     type: number
 *                     example: 8900
 *                   currency:
 *                     type: string
 *                     example: "USD"
 *                   url:
 *                     type: string
 *                   isHidden:
 *                     type: boolean
 *                   retailerId:
 *                     type: string
 *                   images:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *           example:
 *             productId: "1234567890"
 *             update:
 *               name: "Camiseta Premium v2"
 *               description: "Nueva descripción mejorada"
 *               price: 8900
 *               currency: "USD"
 *               isHidden: false
 *               images:
 *                 - url: "https://example.com/nueva-imagen.jpg"
 *     responses:
 *       200:
 *         description: Producto actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 productId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 price:
 *                   type: number
 *             example:
 *               id: 1
 *               productId: "1234567890"
 *               name: "Camiseta Premium v2"
 *               description: "Nueva descripción mejorada"
 *               price: 8900
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Sesión o producto no encontrado
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
	product.update,
);

/**
 * @swagger
 * /products/delete:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Eliminar productos en lote
 *     description: |
 *       Elimina uno o varios productos del catálogo de WhatsApp Business.
 *       También elimina los registros de la base de datos local.
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
 *                 description: Lista de IDs de productos a eliminar
 *                 items:
 *                   type: string
 *                 example: ["1234567890", "0987654321"]
 *           example:
 *             productIds: ["1234567890", "0987654321"]
 *     responses:
 *       200:
 *         description: Productos eliminados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Mensaje con cantidad de productos eliminados
 *             example:
 *               message: "2 products deleted"
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Sesión no encontrada
 */
router.post(
	"/delete",
	body("productIds").isArray().notEmpty(),
	requestValidator,
	product.deleteRoute,
);

/**
 * @swagger
 * /products/order-details:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Obtener detalles de una orden
 *     description: |
 *       Obtiene los detalles completos de una orden de compra recibida.
 *       El orderId y token se obtienen del mensaje de orden recibido.
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
 *                 description: ID de la orden (recibido en el mensaje de orden)
 *                 example: "order_abc123"
 *               token:
 *                 type: string
 *                 description: Token de autenticación de la orden (base64)
 *                 example: "dG9rZW5fYXV0aA=="
 *           example:
 *             orderId: "order_abc123"
 *             token: "dG9rZW5fYXV0aA=="
 *     responses:
 *       200:
 *         description: Detalles de la orden obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       quantity:
 *                         type: number
 *                       price:
 *                         type: number
 *                 totalAmount:
 *                   type: number
 *                 currency:
 *                   type: string
 *             example:
 *               orderId: "order_abc123"
 *               products:
 *                 - id: "prod_1"
 *                   name: "Camiseta Premium"
 *                   quantity: 2
 *                   price: 9900
 *               totalAmount: 19800
 *               currency: "USD"
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Sesión u orden no encontrada
 */
router.post(
	"/order-details",
	body("orderId").isString().notEmpty(),
	body("token").isString().notEmpty(),
	requestValidator,
	product.getOrderDetails,
);

/**
 * @swagger
 * /products/send-message:
 *   post:
 *     tags:
 *       - Catálogo y Productos
 *     summary: Enviar mensaje con producto
 *     description: |
 *       Envía un mensaje de WhatsApp que incluye información de un producto.
 *       Útil para compartir productos individuales con clientes.
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
 *                 description: JID del destinatario
 *                 example: "5491112345678@s.whatsapp.net"
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
 *                     required:
 *                       - url
 *                     properties:
 *                       url:
 *                         type: string
 *                         description: URL de la imagen del producto
 *                         example: "https://example.com/producto.jpg"
 *                   title:
 *                     type: string
 *                     description: Título del producto
 *                     example: "Camiseta Premium"
 *                   description:
 *                     type: string
 *                     description: Descripción del producto
 *                     example: "Camiseta 100% algodón"
 *                   currencyCode:
 *                     type: string
 *                     description: Código ISO de moneda
 *                     example: "USD"
 *                   priceAmount1000:
 *                     type: number
 *                     description: Precio en milésimas (99000 = $99.00)
 *                     example: 99000
 *                   retailerId:
 *                     type: string
 *                     description: SKU o ID del vendedor
 *                     example: "SKU-12345"
 *                   url:
 *                     type: string
 *                     description: URL del producto
 *                     example: "https://mitienda.com/producto"
 *               options:
 *                 type: object
 *                 description: Opciones adicionales del mensaje (quotedMessageId, etc.)
 *           example:
 *             jid: "5491112345678@s.whatsapp.net"
 *             product:
 *               productImage:
 *                 url: "https://example.com/producto.jpg"
 *               title: "Camiseta Premium"
 *               description: "Camiseta 100% algodón, talle M"
 *               currencyCode: "USD"
 *               priceAmount1000: 99000
 *               retailerId: "SKU-12345"
 *               url: "https://mitienda.com/producto"
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 details:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: object
 *                       properties:
 *                         remoteJid:
 *                           type: string
 *                         fromMe:
 *                           type: boolean
 *                         id:
 *                           type: string
 *             example:
 *               message: "Product message sent"
 *               details:
 *                 key:
 *                   remoteJid: "5491112345678@s.whatsapp.net"
 *                   fromMe: true
 *                   id: "BAE5ABC123"
 *       400:
 *         description: JID inválido o datos incorrectos
 *       404:
 *         description: Sesión no encontrada
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
	product.sendProductMessage,
);

// ==================== Business Profile Routes ====================

/**
 * @swagger
 * /products/business-profile:
 *   put:
 *     tags:
 *       - Perfil de Negocio
 *     summary: Actualizar perfil de negocio
 *     description: |
 *       Modifica la información del perfil de WhatsApp Business:
 *       - Dirección física del negocio
 *       - Email de contacto
 *       - Descripción del negocio
 *       - Sitios web (hasta 2 URLs)
 *       - Horarios de atención por día de la semana
 *
 *       **Nota sobre horarios:** Los tiempos se especifican en minutos desde medianoche.
 *       Por ejemplo: 9:00 AM = 540 minutos, 6:00 PM = 1080 minutos.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *                 description: Dirección física del negocio
 *                 example: "Av. Corrientes 1234, Buenos Aires"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email de contacto
 *                 example: "contacto@mitienda.com"
 *               description:
 *                 type: string
 *                 description: Descripción del negocio (máx. 256 caracteres)
 *                 example: "Tienda de ropa y accesorios. Envíos a todo el país."
 *               websites:
 *                 type: array
 *                 description: URLs del sitio web (máximo 2)
 *                 maxItems: 2
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://mitienda.com", "https://instagram.com/mitienda"]
 *               hours:
 *                 type: object
 *                 description: Configuración de horarios de atención
 *                 properties:
 *                   timezone:
 *                     type: string
 *                     description: Zona horaria IANA
 *                     example: "America/Argentina/Buenos_Aires"
 *                   days:
 *                     type: array
 *                     description: Configuración por día
 *                     items:
 *                       type: object
 *                       required:
 *                         - day
 *                         - mode
 *                       properties:
 *                         day:
 *                           type: string
 *                           enum: [sun, mon, tue, wed, thu, fri, sat]
 *                           description: Día de la semana (formato corto en inglés)
 *                         mode:
 *                           type: string
 *                           enum: [open_24h, appointment_only, specific_hours]
 *                           description: |
 *                             Modo de operación:
 *                             - `open_24h`: Abierto 24 horas
 *                             - `appointment_only`: Solo con cita previa
 *                             - `specific_hours`: Horario específico (requiere openTimeInMinutes y closeTimeInMinutes)
 *                         openTimeInMinutes:
 *                           type: string
 *                           description: Hora de apertura en minutos desde medianoche (solo para specific_hours)
 *                           example: "540"
 *                         closeTimeInMinutes:
 *                           type: string
 *                           description: Hora de cierre en minutos desde medianoche (solo para specific_hours)
 *                           example: "1080"
 *           examples:
 *             perfil_completo:
 *               summary: Perfil completo con horarios
 *               value:
 *                 address: "Av. Corrientes 1234, Buenos Aires"
 *                 email: "contacto@mitienda.com"
 *                 description: "Tienda de ropa y accesorios. Envíos a todo el país."
 *                 websites:
 *                   - "https://mitienda.com"
 *                   - "https://instagram.com/mitienda"
 *                 hours:
 *                   timezone: "America/Argentina/Buenos_Aires"
 *                   days:
 *                     - day: "mon"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "540"
 *                       closeTimeInMinutes: "1080"
 *                     - day: "tue"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "540"
 *                       closeTimeInMinutes: "1080"
 *                     - day: "wed"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "540"
 *                       closeTimeInMinutes: "1080"
 *                     - day: "thu"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "540"
 *                       closeTimeInMinutes: "1080"
 *                     - day: "fri"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "540"
 *                       closeTimeInMinutes: "1080"
 *                     - day: "sat"
 *                       mode: "specific_hours"
 *                       openTimeInMinutes: "600"
 *                       closeTimeInMinutes: "900"
 *                     - day: "sun"
 *                       mode: "appointment_only"
 *             solo_direccion:
 *               summary: Solo actualizar dirección
 *               value:
 *                 address: "Nueva dirección 5678"
 *             negocio_24h:
 *               summary: Negocio abierto 24/7
 *               value:
 *                 hours:
 *                   timezone: "America/Argentina/Buenos_Aires"
 *                   days:
 *                     - day: "mon"
 *                       mode: "open_24h"
 *                     - day: "tue"
 *                       mode: "open_24h"
 *                     - day: "wed"
 *                       mode: "open_24h"
 *                     - day: "thu"
 *                       mode: "open_24h"
 *                     - day: "fri"
 *                       mode: "open_24h"
 *                     - day: "sat"
 *                       mode: "open_24h"
 *                     - day: "sun"
 *                       mode: "open_24h"
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   description: Respuesta raw de WhatsApp
 *             example:
 *               message: "Business profile updated"
 *               result: {}
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             example:
 *               error: "Invalid email format"
 *       404:
 *         description: Sesión no encontrada
 *         content:
 *           application/json:
 *             example:
 *               error: "Session not found"
 *       500:
 *         description: Error al actualizar el perfil
 *         content:
 *           application/json:
 *             example:
 *               error: "An error occurred while updating business profile"
 */
router.put(
	"/business-profile",
	body("address").isString().optional(),
	body("email").isEmail().optional(),
	body("description").isString().optional(),
	body("websites").isArray().optional(),
	body("hours").isObject().optional(),
	body("hours.timezone").isString().optional(),
	body("hours.days").isArray().optional(),
	requestValidator,
	product.updateBusinessProfile,
);

/**
 * @swagger
 * /products/cover-photo:
 *   put:
 *     tags:
 *       - Perfil de Negocio
 *     summary: Actualizar foto de portada
 *     description: |
 *       Sube o reemplaza la foto de portada del perfil de WhatsApp Business.
 *
 *       **Requisitos de la imagen:**
 *       - Formato: JPG o PNG
 *       - Tamaño recomendado: 640x340 píxeles
 *       - La URL debe ser accesible públicamente
 *
 *       **Importante:** Guarda el `fbid` retornado para poder eliminar la foto posteriormente.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: uri
 *                 description: URL pública de la imagen para la foto de portada
 *                 example: "https://example.com/mi-portada.jpg"
 *           example:
 *             photo: "https://example.com/mi-portada.jpg"
 *     responses:
 *       200:
 *         description: Foto de portada actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cover photo updated"
 *                 fbid:
 *                   type: string
 *                   description: ID de la foto en WhatsApp/Facebook. Guárdalo para eliminar la foto después.
 *                   example: "123456789012345"
 *             example:
 *               message: "Cover photo updated"
 *               fbid: "123456789012345"
 *       400:
 *         description: URL inválida o imagen no accesible
 *         content:
 *           application/json:
 *             example:
 *               error: "Invalid photo URL"
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error al actualizar la foto
 *         content:
 *           application/json:
 *             example:
 *               error: "An error occurred while updating cover photo"
 */
router.put(
	"/cover-photo",
	body("photo").isString().notEmpty(),
	requestValidator,
	product.updateCoverPhoto,
);

/**
 * @swagger
 * /products/cover-photo:
 *   delete:
 *     tags:
 *       - Perfil de Negocio
 *     summary: Eliminar foto de portada
 *     description: |
 *       Elimina la foto de portada actual del perfil de WhatsApp Business.
 *
 *       Necesitas el `fbid` que se retornó al subir la foto con PUT /products/cover-photo.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: ID de la foto de portada (fbid obtenido al subirla)
 *                 example: "123456789012345"
 *           example:
 *             id: "123456789012345"
 *     responses:
 *       200:
 *         description: Foto de portada eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Cover photo removed"
 *       400:
 *         description: ID inválido o no proporcionado
 *         content:
 *           application/json:
 *             example:
 *               error: "id is required"
 *       404:
 *         description: Sesión no encontrada o foto no existe
 *       500:
 *         description: Error al eliminar la foto
 *         content:
 *           application/json:
 *             example:
 *               error: "An error occurred while removing cover photo"
 */
router.delete(
	"/cover-photo",
	body("id").isString().notEmpty(),
	requestValidator,
	product.removeCoverPhoto,
);

export default router;
