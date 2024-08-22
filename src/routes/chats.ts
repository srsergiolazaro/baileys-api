import { Router } from "express";
import { query, body } from "express-validator";
import { chat } from "../controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	chat.list,
);

router.get(
	"/:jid",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	chat.find,
);

router.post(
	"/mute",
	body("jid").isString().notEmpty(),
	body("duration").isNumeric().notEmpty(),
	requestValidator,
	sessionValidator,
	chat.mute,
);

router.post(
	"/read",
	body("jid").isString().notEmpty(),
	body("messageIds").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	chat.markRead,
);

router.post(
	"/disappearing",
	body("jid").isString().notEmpty(),
	body("duration").isNumeric().optional(),
	requestValidator,
	sessionValidator,
	chat.setDisappearing,
);

export default router;
