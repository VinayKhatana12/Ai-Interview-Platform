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
  evaluate,
  list,
  results,
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
router.post("/:id/evaluate", evaluate);
router.get("/:id", detail);
router.get("/:id/session", session);
router.get("/:id/results", results);

export default router;
