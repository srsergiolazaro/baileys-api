import { Router } from "express";
import { query, body } from "express-validator";
import { group } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router({ mergeParams: true });

router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	group.list,
);

router.post(
	"/find",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.find,
);

router.get("/:jid/photo", sessionValidator, group.photo);

router.post(
	"/",
	body("subject").isString().notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	group.create,
);

router.put(
	"/update",
	body("jid").isString().notEmpty(),
	body("subject").isString().optional(),
	requestValidator,
	sessionValidator,
	group.update,
);

router.delete(
	"/delete",
	body("jid").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.deleteGroup,
);

router.post(
	"/participants",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["add", "remove", "promote", "demote"]).notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	group.updateParticipants,
);

router.post(
	"/settings",
	body("jid").isString().notEmpty(),
	body("settings").isString().notEmpty(),
	requestValidator,
	sessionValidator,
	group.updateSettings,
);

export default router;
