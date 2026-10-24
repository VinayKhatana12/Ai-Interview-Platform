import {
  createInterview,
  getInterview,
  getInterviewStats,
  listInterviews,
} from "../services/interview.service.js";

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

export { create, list, detail, stats };
