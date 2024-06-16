import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { query, body } from "express-validator";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

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
	upload.single("file"),
	body().isObject().notEmpty(),
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
