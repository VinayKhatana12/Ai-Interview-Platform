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
  speech,
  analytics,
  start,
  stats,
  transcribe,
} from "../controllers/interview.controller.js";
import { audioUpload } from "../middleware/upload.js";
import { speechLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createInterviewSchema), create);
router.get("/stats", stats);
router.get("/analytics", analytics);
router.get("/", validate(listInterviewsQuerySchema, "query"), list);
router.post("/:id/start", start);
router.post("/:id/answers", validate(submitAnswerSchema), answer);
router.post("/:id/complete", complete);
router.post("/:id/evaluate", evaluate);
router.post("/:id/transcribe", audioUpload.single("audio"), transcribe);
router.post("/:id/speech", speechLimiter, speech);
router.get("/:id", detail);
router.get("/:id/session", session);
router.get("/:id/results", results);

export default router;
