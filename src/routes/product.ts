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

router.put(
	"/update",
	body("productId").isString().notEmpty(),
	body("update").isObject().notEmpty(),
	body("update.name").isString().notEmpty(),
	body("update.description").isString().notEmpty(),
	body("update.price").isNumeric().notEmpty(),
	body("update.currency").isString().notEmpty(),
	body("update.url").isString().optional(),
	body("update.isHidden").isBoolean().optional(),
	body("update.retailerId").isString().optional(),
	body("update.images").isArray().optional(),
	requestValidator,
	sessionValidator,
	product.update,
);

export default router;
