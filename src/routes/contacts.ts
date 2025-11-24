import { Router } from "express";
import { body, query } from "express-validator";
import { contact } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import jidValidator from "@/middlewares/jid-validator";

const router = Router({ mergeParams: true });

router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	contact.list,
);

router.get("/blocklist", contact.listBlocked);

router.post(
	"/blocklist/update",
	body("jid").isString().notEmpty(),
	body("action").isString().isIn(["block", "unblock"]).optional(),
	requestValidator,
	contact.updateBlock,
);


router.get("/:jid", jidValidator, contact.check);

router.get("/:jid/photo", contact.photo);

export default router;
