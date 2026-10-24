import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { createInterviewSchema, listInterviewsQuerySchema } from "../validation/interviews.js";
import { submitAnswerSchema } from "../validation/answers.js";
import {
  answer,
  complete,
  create,
  detail,
  list,
  session,
  start,
  stats,
} from "../controllers/interview.controller.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createInterviewSchema), create);
router.get("/stats", stats);
router.get("/", validate(listInterviewsQuerySchema, "query"), list);
router.post("/:id/start", start);
router.post("/:id/answers", validate(submitAnswerSchema), answer);
router.post("/:id/complete", complete);
router.get("/:id", detail);
router.get("/:id/session", session);

export default router;
