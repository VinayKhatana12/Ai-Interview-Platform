import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { createInterviewSchema, listInterviewsQuerySchema } from "../validation/interviews.js";
import { create, detail, list, stats } from "../controllers/interview.controller.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createInterviewSchema), create);
router.get("/stats", stats);
router.get("/", validate(listInterviewsQuerySchema, "query"), list);
router.get("/:id", detail);

export default router;
