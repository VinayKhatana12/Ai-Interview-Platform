import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { createInterviewSchema, listInterviewsQuerySchema, compareQuerySchema } from "../validation/interviews.js";
import { submitAnswerSchema } from "../validation/answers.js";
import {
  answer,
  complete,
  create,
  detail,
  evaluate,
  feedback,
  followup,
  list,
  results,
  session,
  speech,
  analytics,
  retake,
  compare,
  start,
  stats,
  transcribe,
} from "../controllers/interview.controller.js";
import { audioUpload } from "../middleware/upload.js";
import { speechLimiter, sttLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.use(requireAuth);

// URL ids are validated before they reach Prisma: bounded, no separators or
// control characters, so garbage ids answer 422 instead of surfacing as a
// generic database 500.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
router.param("id", (req, res, next, value) => {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid interview id.", details: { id: "Invalid interview id" } },
    });
  }
  next();
});

router.post("/", validate(createInterviewSchema), create);
router.get("/stats", stats);
router.get("/analytics", analytics);
router.get("/", validate(listInterviewsQuerySchema, "query"), list);
router.post("/:id/start", start);
router.post("/:id/answers", validate(submitAnswerSchema), answer);
router.post("/:id/followup", followup);
router.post("/:id/complete", complete);
router.post("/:id/evaluate", evaluate);
router.post("/:id/feedback", feedback);
router.post("/:id/retake", retake);
router.get("/:id/compare", validate(compareQuerySchema, "query"), compare);
router.post("/:id/transcribe", sttLimiter, audioUpload.single("audio"), transcribe);
router.post("/:id/speech", speechLimiter, speech);
router.get("/:id", detail);
router.get("/:id/session", session);
router.get("/:id/results", results);

export default router;
