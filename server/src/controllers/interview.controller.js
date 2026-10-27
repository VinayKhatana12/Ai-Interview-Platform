import {
  createInterview,
  getInterviewAnalytics,
  getInterview,
  getInterviewStats,
  listInterviews,
} from "../services/interview.service.js";
import {
  buildSessionView,
  completeInterview,
  startInterview,
  submitAnswer,
} from "../services/interviewSession.service.js";
import { buildResultsView, evaluateInterview } from "../services/evaluation.service.js";
import { transcribeInterviewAudio } from "../services/transcription.service.js";
import { generateQuestionSpeech, speechRequestSchema } from "../services/speech.service.js";
import { generateFollowUp } from "../services/followup.service.js";
import { z } from "zod";

// POST /api/interviews — owner derived from the session, never the body.
async function create(req, res, next) {
  try {
    const interview = await createInterview(req.user.id, req.body);
    res.status(201).json({ interview });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await listInterviews(req.user.id, req.validatedQuery);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const interview = await getInterview(req.user.id, req.params.id);
    res.json({ interview });
  } catch (err) {
    next(err);
  }
}

async function analytics(req, res, next) {
  try {
    res.json(await getInterviewAnalytics(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    res.json(await getInterviewStats(req.user.id));
  } catch (err) {
    next(err);
  }
}

// Session flow: start, current state, submit answer, complete.
async function start(req, res, next) {
  try {
    res.status(201).json(await startInterview(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

async function session(req, res, next) {
  try {
    res.json(await buildSessionView(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

async function answer(req, res, next) {
  try {
    res.json(await submitAnswer(req.user.id, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    res.json(await completeInterview(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

// AI feedback: evaluate unevaluated answers (state-machine neutral), then
// read results. GET /results is a pure read.
async function evaluate(req, res, next) {
  try {
    res.json(await evaluateInterview(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

async function results(req, res, next) {
  try {
    res.json(await buildResultsView(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

// POST /:id/transcribe — multipart audio -> transcript (stateless, not persisted).
async function transcribe(req, res, next) {
  try {
    res.json(await transcribeInterviewAudio(req.user.id, req.params.id, req.file));
  } catch (err) {
    next(err);
  }
}

// POST /:id/speech — binary audio of an existing question (trusted source,
// never client text). X-Voice-Source names the provider for honest labeling.
async function speech(req, res, next) {
  try {
    const parsed = speechRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields need attention.", details: { questionId: "Unknown question" } },
      });
    }
    const { buffer, mimeType, source } = await generateQuestionSpeech(req.user.id, req.params.id, parsed.data);
    res
      .setHeader("Content-Type", mimeType)
      .setHeader("Content-Length", buffer.length)
      .setHeader("X-Voice-Source", source)
      .setHeader("Cache-Control", "no-store")
      .send(buffer);
  } catch (err) {
    next(err);
  }
}

// POST /:id/followup — decide and (if warranted) generate one adaptive
// follow-up for an answered question. 200 even when the AI fails: the
// response carries the advanced session and a retryable note, so the
// candidate never loses an answer over a provider hiccup.
const followupBodySchema = z.strictObject({ questionId: z.string().uuid('Unknown question') });

async function followup(req, res, next) {
  try {
    const parsed = followupBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Some fields need attention.', details: { questionId: 'Unknown question' } },
      });
    }
    const result = await generateFollowUp(req.user.id, req.params.id, parsed.data.questionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export { create, list, detail, stats, analytics, start, session, answer, complete, evaluate, results, transcribe, speech, followup };
