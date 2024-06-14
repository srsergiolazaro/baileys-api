import type { ProductBase, WAMediaUpload } from "@whiskeysockets/baileys";
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

		await session.productCreate(product);
		return res.status(200).json({ message: "Product created" });
	} catch (error) {
		const message = "An error occured during product creation";
		logger.error(error, message);
		return res.status(500).json({ error: message });
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
