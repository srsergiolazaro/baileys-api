import { Router } from "express";
import { session } from "@/controllers";
import sessionValidator from "@/middlewares/session-validator";
// import requestValidator from "@/middlewares/request-validator";
import { body } from "express-validator";
import { apiKeyValidator, apiKeyValidatorParam } from "@/middlewares/api-key-validator";

const router = Router();
//router.get("/", apiKeyValidator, session.list);
router.get("/", apiKeyValidator, sessionValidator, session.find);
router.get("/status", apiKeyValidator, sessionValidator, session.status);
router.post(
	"/add",
	body("sessionId").isString().notEmpty(),
	//apiKeyValidator,
	//requestValidator,
	session.add,
);
router.get("/add-sse", apiKeyValidatorParam, session.addSSE);
router.delete("/", apiKeyValidator, sessionValidator, session.del);

export default router;
