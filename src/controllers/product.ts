import { prisma } from "@/db";
import type { ProductBase, ProductUpdate, WAMediaUpload } from "baileys";
import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession, jidExists } from "@/whatsapp";

export const list: RequestHandler = async (req, res) => {
	try {
		const { jid } = req.body;

		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		const { exists, formatJid } = await jidExists(session, jid, "number");
		if (!exists) return res.status(400).json({ error: "JID does not exist" });

		const products = await session.getCatalog({ jid: formatJid });
		console.log(products);
		return res.status(200).json(products);
	} catch (error) {
		const message = "An error occurred during product list";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};

export const getCollections: RequestHandler = async (req, res) => {
	try {
		const { jid, limit } = req.body as { jid?: string; limit?: number };
		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		// Verificar JID si se proporciona
		if (jid) {
			const { exists } = await jidExists(session, jid, "number");
			if (!exists) return res.status(400).json({ error: "JID does not exist" });
		}

		const collections = await session.getCollections(jid, limit);
		return res.status(200).json(collections);
	} catch (error) {
		const message = "An error occurred during collection fetch";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};

export const create: RequestHandler = async (req, res) => {
	try {
		const product = req.body as ProductBase & {
			images: WAMediaUpload[];
			originCountryCode: string | undefined;
		};

		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		const productRes = await session.productCreate(product);

		const savedProduct = await prisma.product.create({
			data: {
				productId: productRes.id,
				name: product.name,
				description: product.description,
				price: product.price,
				currency: product.currency,
				isHidden: product.isHidden,
				retailerId: product.retailerId,
				originCountryCode: product.originCountryCode,
				url: product.url,
				sessionId: req.appData.sessionId,
				images: {
					create: product.images.map((image: any) => ({
						url: image.url,
					})),
				},
			},
			include: {
				images: true,
			},
		});

		return res.status(200).json({ message: "Product created", productRes, savedProduct });
	} catch (error) {
		const message = "An error occurred during product creation";
		logger.error(error, message);
		return res.status(500).json({ error, message });
	}
};

export const deleteRoute: RequestHandler = async (req, res) => {
	try {
		const { productIds: whatsappIds } = req.body as { productIds: string[] };
		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		const { deleted } = await session.productDelete(whatsappIds);

		const product = await prisma.product.findFirst({
			where: {
				productId: {
					in: whatsappIds,
				},
			},
		});

		const productId = product?.id;

		await prisma.image.deleteMany({
			where: {
				productId: {
					in: productId ? [productId] : [],
				},
			},
		});

		await prisma.product.deleteMany({
			where: {
				productId: {
					in: whatsappIds,
				},
			},
		});

		return res.status(200).json({ message: `${deleted} products deleted` });
	} catch (error) {
		const message = "An error occurred during product deletion";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};

export const update: RequestHandler = async (req, res) => {
	try {
		const { productId, update } = req.body as { productId: string; update: ProductUpdate };
		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		await session.productUpdate(productId, update);

		// Actualizar el producto en la base de datos
		const updatedProduct = await prisma.product.update({
			where: { productId },
			data: {
				name: update.name,
				description: update.description,
				price: update.price,
				currency: update.currency,
				isHidden: update.isHidden,
				retailerId: update.retailerId,
				url: update.url,
				images: {
					deleteMany: {},
					create: update.images.map((image: any) => ({
						url: image.url,
					})),
				},
			},
		});

		return res.status(200).json(updatedProduct);
	} catch (error) {
		const message = "An error occurred during product update";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};

export const getOrderDetails: RequestHandler = async (req, res) => {
	try {
		const { orderId, token } = req.body as { orderId: string; token: string };
		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		const orderDetails = await session.getOrderDetails(orderId, token);
		return res.status(200).json(orderDetails);
	} catch (error) {
		const message = "An error occurred while fetching order details";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};

export const sendProductMessage: RequestHandler = async (req, res) => {
	try {
		const { jid, product, options } = req.body as {
			jid: string;
			product: any; // Ajusta este tipo según la definición de Baileys
			options?: any; // Ajusta este tipo según la definición de Baileys
		};
		const session = getSession(req.appData.sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}

		const { exists, formatJid } = await jidExists(session, jid, "number");
		if (!exists) return res.status(400).json({ error: "JID does not exist" });

		const message = await session.sendMessage(formatJid, product, options);
		return res.status(200).json({ message: "Product message sent", details: message });
	} catch (error) {
		const message = "An error occurred while sending product message";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};
