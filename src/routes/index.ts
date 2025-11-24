import { Router } from "express";
import chatRoutes from "./chats";
import groupRoutes from "./groups";
import messageRoutes from "./messages";
import sessionRoutes from "./sessions";
import contactRoutes from "./contacts";
import webhookRoutes from "./webhooks";
import productRoutes from "./product";
import userRoutes from "./user";

import userSessionsRoute from "./user-sessions";
import keysRoutes from "./keys";
import { apiKeyValidator, apiKeyValidatorKeyOnly } from "@/middlewares/api-key-validator";
import { list } from "@/controllers/session";

const router = Router();
router.get("/list", list);


router.use("/sessions", apiKeyValidatorKeyOnly, sessionRoutes);
router.use("/chats", apiKeyValidator, chatRoutes);
router.use("/contacts", apiKeyValidator, contactRoutes);
router.use("/groups", apiKeyValidator, groupRoutes);
router.use("/product", apiKeyValidator, productRoutes);
router.use("/messages", apiKeyValidator, messageRoutes);
router.use("/webhooks", apiKeyValidator, webhookRoutes);
router.use("/user", apiKeyValidator, userRoutes);

router.use("/user-sessions", userSessionsRoute);
router.use("/keys", keysRoutes);

export default router;
