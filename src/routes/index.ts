import { Router } from "express";
import chatRoutes from "./chats";
import groupRoutes from "./groups";
import messageRoutes from "./messages";
import sessionRoutes from "./sessions";
import contactRoutes from "./contacts";
import webhookRoutes from "./webhooks";
import productRoutes from "./product";
import tokenRoutes from "./token";
import userSessionsRoute from "./user-sessions";
import { apiKeyValidatorParam } from "@/middlewares/api-key-validator";
import jwtValidator from "@/middlewares/jwt-validator";
import sessionValidator from "@/middlewares/session-validator";

const router = Router();
router.use("/sessions", sessionRoutes);
router.use("/chats", jwtValidator, sessionValidator, chatRoutes);
router.use("/contacts", apiKeyValidatorParam, contactRoutes);
router.use("/groups", apiKeyValidatorParam, groupRoutes);
router.use("/product", apiKeyValidatorParam, productRoutes);
router.use("/messages", messageRoutes);
router.use("/webhooks", apiKeyValidatorParam, webhookRoutes);
router.use("/token", tokenRoutes);
router.use("/user-sessions", userSessionsRoute);

export default router;
