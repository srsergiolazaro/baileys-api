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

import jwtValidator from "@/middlewares/jwt-validator";

const router = Router();
router.use("/sessions", sessionRoutes);
router.use("/chats", jwtValidator, chatRoutes);
router.use("/contacts", jwtValidator, contactRoutes);
router.use("/groups", jwtValidator, groupRoutes);
router.use("/product", jwtValidator, productRoutes);
router.use("/messages", jwtValidator, messageRoutes);
router.use("/webhooks", jwtValidator, webhookRoutes);
router.use("/token", tokenRoutes);
router.use("/user-sessions", userSessionsRoute);

export default router;
