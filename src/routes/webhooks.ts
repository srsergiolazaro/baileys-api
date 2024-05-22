import { Router } from "express";
import { body, param } from "express-validator";
import { webhook } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

router.get("/", sessionValidator, webhook.list);

router.post(
	"/",
	body("url").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.create,
);

router.put(
	"/:id",
	param("id").isNumeric().notEmpty(),
	body("url").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.update,
);

router.delete(
	"/:id",
	param("id").isNumeric().notEmpty(),
	requestValidator,
	sessionValidator,
	webhook.remove,
);

export default router;
