import { token } from "@/controllers";
import { Router } from "express";

const router = Router({ mergeParams: true });

router.post("/generate-api-key", token.create);

export default router;
