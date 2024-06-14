import type { ProductBase, ProductUpdate, WAMediaUpload } from "@whiskeysockets/baileys";
import type { RequestHandler } from "express";
import { logger } from "@/shared";
import { getSession } from "@/whatsapp";

export const create: RequestHandler = async (req, res) => {
	try {
		/*


type ProductBase = {
    name: string;
    retailerId?: string | undefined;
    url?: string | undefined;
    description: string;
    price: number;
    currency: string;
    isHidden?: boolean | undefined;
}
type WAMediaUpload = Buffer | {
    url: URL | string;
} | {
    stream: Readable;
}
        */
		const product = req.body as ProductBase & {
			images: WAMediaUpload[];
			originCountryCode: string | undefined;
		};
		console.log(product);

		const session = getSession(req.params.sessionId)!;

		const productRes = await session.productCreate(product);
		/*
Product: ProductBase & {
    availability: ProductAvailability;
    id: string;
    imageUrls: {
        [_: string]: string;
    };
    reviewStatus: {
        [_: string]: string;
    };
}
        */
		return res.status(200).json({ message: "Product created", productRes });
	} catch (error) {
		const message = "An error occured during product creation";
		logger.error(error, message);
		return res.status(500).json({ error, message });
	}
};

/*

productDelete: ((productIds) => Promise<{
    deleted: number;
}>)
(productIds): Promise<{
    deleted: number;
}>
Parameters
productIds: string[]
Returns Promise<{
    deleted: number;
}>
*/
export const deleteRoute: RequestHandler = async (req, res) => {
	try {
		const { productIds } = req.body as { productIds: string[] };
		const session = getSession(req.params.sessionId)!;

		const { deleted } = await session.productDelete(productIds);
		return res.status(200).json({ message: `${deleted} products deleted` });
	} catch (error) {
		const message = "An error occured during product deletion";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};
/*
    productUpdate: ((productId, update) => Promise<Product>);
type ProductUpdate = {
    description: string;
    name: string;
    url?: string | undefined;
    retailerId?: string | undefined;
    price: number;
    currency: string;
    isHidden?: boolean | undefined;
    images: WAMediaUpload[];
}
*/

export const update: RequestHandler = async (req, res) => {
	try {
		const { productId, update } = req.body as { productId: string; update: ProductUpdate };
		const session = getSession(req.params.sessionId)!;

		const product = await session.productUpdate(productId, update);
		return res.status(200).json(product);
	} catch (error) {
		const message = "An error occured during product update";
		logger.error(error, message);
		return res.status(500).json({ error: message });
	}
};
