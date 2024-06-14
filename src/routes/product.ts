import { Router } from "express";
import { product } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { body } from "express-validator";

const router = Router({ mergeParams: true });

router.post(
	"/create",
	body("name").isString().notEmpty(),
	body("currency").isString().notEmpty(),
	body("description").isString().notEmpty(),
	body("price").isNumeric().notEmpty(),
	body("url").isString().optional(),
	body("isHidden").isBoolean().optional(),
	body("retailerId").isString().optional(),
	body("originCountryCode").isString().optional(),
	body("images").isArray().optional(),
	requestValidator,
	sessionValidator,
	product.create,
);
router.post(
	"/delete",
	body("productIds").isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	product.deleteRoute,
);
export default router;
