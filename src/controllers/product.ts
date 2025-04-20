/* eslint-disable @typescript-eslint/no-explicit-any */
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
					in: productId,
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
