import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { query, body } from "express-validator";

const router = Router({ mergeParams: true });
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	message.list,
);

router.post(
	"/send",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("message")
		.isObject()
		.notEmpty()
		.custom((value, { req }) => {
			// Custom validation to ensure message is either a buffer or an object with url
			if (req.is("application/json")) {
				if (
					typeof value !== "object" ||
					(!Buffer.isBuffer(value.image) &&
						!value.image?.url &&
						!Buffer.isBuffer(value.document) &&
						!value.document?.url)
				) {
					throw new Error("Invalid message format");
				}
			}
			return true;
		}),
	body("options").isObject().optional(),
	requestValidator,
	sessionValidator,
	message.sendWithFormData,
);
router.post(
	"/send/bulk",
	body().isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	message.sendBulk,
);
router.post(
	"/download",
	body().isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.download,
);

export default router;
