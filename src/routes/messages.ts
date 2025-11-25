import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
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


router.post("/send", upload.single("file"), requestValidator, message.send);

router.post("/send/bulk", body().isArray().notEmpty(), requestValidator, message.sendBulk);

router.post("/download", body().isObject().notEmpty(), requestValidator, message.download);

router.delete(
	"/delete",
	body("jid").isString().notEmpty(),
	body("key").isObject().notEmpty(),
	requestValidator,
	message.deleteMessage,
);

export default router;
