import { Router } from "express";
import chatRoutes from "./chats";
import groupRoutes from "./groups";
import messageRoutes from "./messages";
import sessionRoutes from "./sessions";
import contactRoutes from "./contacts";
import webhookRoutes from "./webhooks";
import productRoutes from "./product";
import tokenRoutes from "./token";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

const router = Router();
router.use("/sessions", sessionRoutes);
router.use("/chats", apiKeyValidator, chatRoutes);
router.use("/contacts", apiKeyValidator, contactRoutes);
router.use("/groups", apiKeyValidator, groupRoutes);
router.use("/product", apiKeyValidator, productRoutes);
router.use("/messages", apiKeyValidator, messageRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/token", tokenRoutes);

export default router;
