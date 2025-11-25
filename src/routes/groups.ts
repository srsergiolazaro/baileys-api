import { Router } from "express";
import { query, body } from "express-validator";
import { group } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";

const router = Router({ mergeParams: true });

router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	group.list,
);

router.post("/search", body("name").isString().optional(), requestValidator, group.search);

router.post("/find", body("jid").isString().notEmpty(), requestValidator, group.find);

router.get("/:jid/photo", group.photo);

router.post(
	"/",
	body("subject").isString().notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	group.create,
);

router.put(
	"/update",
	body("jid").isString().notEmpty(),
	body("subject").isString().optional(),
	requestValidator,
	group.update,
);

router.delete("/delete", body("jid").isString().notEmpty(), requestValidator, group.deleteGroup);

router.post(
	"/participants",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["add", "remove", "promote", "demote"]).notEmpty(),
	body("participants").isArray().notEmpty(),
	requestValidator,
	group.updateParticipants,
);

router.post(
	"/settings",
	body("jid").isString().notEmpty(),
	body("settings").isString().notEmpty(),
	requestValidator,
	group.updateSettings,
);

router.post("/leave", body("jid").isString().notEmpty(), requestValidator, group.leaveGroup);

router.post(
	"/update-subject",
	body("jid").isString().notEmpty(),
	body("subject").isString().notEmpty(),
	requestValidator,
	group.updateSubject,
);

router.post(
	"/update-description",
	body("jid").isString().notEmpty(),
	body("description").isString().notEmpty(),
	requestValidator,
	group.updateDescription,
);

export default router;
