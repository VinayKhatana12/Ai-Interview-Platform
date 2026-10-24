import {
  createInterview,
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

export { create, list, detail, stats, start, session, answer, complete, evaluate, results };
