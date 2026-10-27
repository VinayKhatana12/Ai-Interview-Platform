import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";

// Shape returned by list/detail: config plus a derived score — the mean of
// the answer evaluations that exist, null when none do.
const INTERVIEW_SELECT = {
  id: true,
  roleTitle: true,
  interviewType: true,
  experienceLevel: true,
  difficulty: true,
  interviewType: true,
  mode: true,
  status: true,
  topics: true,
  questionCount: true,
  durationMinutes: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  answers: { select: { evaluation: { select: { score: true } } } },
};

function withScore(interview) {
  const { answers, ...rest } = interview;
  const scores = answers.map((a) => a.evaluation?.score).filter((s) => typeof s === "number");
  const score =
    scores.length === 0
      ? null
      : Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
  return { ...rest, score, answeredCount: scores.length };
}

export async function createInterview(userId, config) {
  // Created as PENDING (draft) — it only becomes IN_PROGRESS when explicitly
  // started by the take-interview flow.
  const interview = await prisma.interview.create({
    data: { ...config, userId, status: "PENDING" },
    select: INTERVIEW_SELECT,
  });
  return withScore(interview);
}

export async function listInterviews(userId, { page, pageSize, status, role, from, to }) {
  // Filters are validated by the query schema; all scoping stays on userId.
  const where = { userId };
  if (status) where.status = status;
  if (role) where.roleTitle = { contains: role, mode: 'insensitive' };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }
  const [total, interviews] = await Promise.all([
    prisma.interview.count({ where }),
    prisma.interview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: INTERVIEW_SELECT,
    }),
  ]);
  return {
    interviews: interviews.map(withScore),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Ownership is a where-clause, not a post-check: another user's id reads as
// "not found" (404) rather than "forbidden" (403), so ids can't be probed.
export async function getInterview(userId, id) {
  const interview = await prisma.interview.findFirst({
    where: { id, userId },
    select: INTERVIEW_SELECT,
  });
  if (!interview) {
    throw new HttpError(404, "NOT_FOUND", "Interview not found.");
  }
  return withScore(interview);
}

// Personal analytics for the signed-in candidate. Same documented score
// method as /stats (interview overall = mean of its evaluated answers,
// 1dp). Skill-wise performance uses the axes the data actually has: the
// question's persisted topic and the evaluator's persisted correctness
// verdict — no invented criteria.
export async function getInterviewAnalytics(userId) {
  const [completedInterviews, evaluatedAnswers, answeredInCompleted] = await Promise.all([
    prisma.interview.findMany({
      where: { userId, status: "COMPLETED" },
      select: { id: true, roleTitle: true, completedAt: true, questionCount: true },
      orderBy: { completedAt: "asc" },
    }),
    // One pass carries everything: per-interview overalls, per-topic stats,
    // correctness verdict counts.
    prisma.answer.findMany({
      where: { interview: { userId, status: "COMPLETED" }, evaluation: { isNot: null } },
      select: {
        interviewId: true,
        question: { select: { topic: true } },
        evaluation: { select: { score: true, correctness: true } },
      },
    }),
    prisma.answer.count({ where: { interview: { userId, status: "COMPLETED" } } }),
  ]);

  const round1 = (n) => Math.round(n * 10) / 10;

  const answeredByInterview = new Map();
  for (const iv of completedInterviews) answeredByInterview.set(iv.id, { evaluated: 0, answered: iv.questionCount });
  const perInterview = new Map(); // id -> { sum, n }
  const byTopic = new Map(); // topic -> { n, sum, correct, partial, incorrect }
  const verdicts = { CORRECT: 0, PARTIALLY_CORRECT: 0, INCORRECT: 0 };

  for (const a of evaluatedAnswers) {
    const bucket = answeredByInterview.get(a.interviewId);
    if (bucket) bucket.evaluated += 1;
    const entry = perInterview.get(a.interviewId) ?? { sum: 0, n: 0 };
    entry.sum += a.evaluation.score;
    entry.n += 1;
    perInterview.set(a.interviewId, entry);

    const topic = a.question.topic;
    const t = byTopic.get(topic) ?? { n: 0, sum: 0, correct: 0, partial: 0, incorrect: 0 };
    t.n += 1;
    t.sum += a.evaluation.score;
    if (a.evaluation.correctness === "CORRECT") t.correct += 1;
    else if (a.evaluation.correctness === "PARTIALLY_CORRECT") t.partial += 1;
    else t.incorrect += 1;
    byTopic.set(topic, t);

    verdicts[a.evaluation.correctness] += 1;
  }

  const interviewScore = (id) => {
    const e = perInterview.get(id);
    return e ? round1(e.sum / e.n) : null;
  };
  const interviewScores = [...perInterview.values()].map((e) => round1(e.sum / e.n));

  // Trend: every scored completed interview in chronological order, with a
  // partial flag when some of its answers are not evaluated. Unscored
  // interviews are excluded, never plotted as zero.
  const trend = completedInterviews
    .filter((iv) => perInterview.has(iv.id))
    .map((iv) => {
      const bucket = answeredByInterview.get(iv.id);
      return {
        id: iv.id,
        roleTitle: iv.roleTitle,
        completedAt: iv.completedAt,
        score: interviewScore(iv.id),
        partial: bucket.evaluated < bucket.answered,
      };
    });

  const topics = [...byTopic.entries()]
    .map(([topic, t]) => ({
      topic,
      answered: t.n,
      avgScore: round1(t.sum / t.n),
      correct: t.correct,
      partial: t.partial,
      incorrect: t.incorrect,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Progress tracking: per-topic first vs latest score, using interview
  // completion order. Only topics with evaluated answers in at least two
  // scored interviews produce a direction; single appearances are excluded
  // so no trend is claimed from one data point.
  const topicByInterview = new Map(); // topic -> Map(interviewId -> {sum,n,completedAt})
  const interviewOrder = new Map(completedInterviews.map((iv, i) => [iv.id, i]));
  for (const a of evaluatedAnswers) {
    const ivIdx = interviewOrder.get(a.interviewId);
    if (ivIdx === undefined) continue; // answer in a non-completed interview
    const topic = a.question.topic;
    const m = topicByInterview.get(topic) ?? new Map();
    const e = m.get(a.interviewId) ?? { sum: 0, n: 0, ivIdx };
    e.sum += a.evaluation.score;
    e.n += 1;
    m.set(a.interviewId, e);
    topicByInterview.set(topic, m);
  }
  const topicTrends = [...topicByInterview.entries()]
    .filter(([_, m]) => m.size >= 2) // need >= 2 scored interviews per topic
    .map(([topic, m]) => {
      const ordered = [...m.entries()].sort((x, y) => x[1].ivIdx - y[1].ivIdx);
      const first = ordered[0][1];
      const latest = ordered[ordered.length - 1][1];
      const firstAvg = round1(first.sum / first.n);
      const latestAvg = round1(latest.sum / latest.n);
      return {
        topic,
        interviews: m.size,
        firstAvg,
        latestAvg,
        delta: round1(latestAvg - firstAvg),
        direction: latestAvg > firstAvg ? 'IMPROVED' : latestAvg < firstAvg ? 'DECLINED' : 'FLAT',
      };
    })
    .sort((a, b) => a.delta - b.delta);

  // Recurring weak skills: weak (avg < 70) across >= 2 scored interviews.
  const recurringWeak = topics.filter(
    (t) => t.avgScore < 70 && (topicByInterview.get(t.topic)?.size ?? 0) >= 2,
  ).map((t) => t.topic);

  // Next focus: the weakest topic from the most recent scored interview.
  const latestScored = [...completedInterviews]
    .filter((iv) => perInterview.has(iv.id))
    .sort((a, b) => b.completedAt - a.completedAt)[0];
  let nextFocus = null;
  if (latestScored) {
    const m = new Map();
    for (const a of evaluatedAnswers) {
      if (a.interviewId !== latestScored.id) continue;
      const t = m.get(a.question.topic) ?? { sum: 0, n: 0 };
      t.sum += a.evaluation.score;
      t.n += 1;
      m.set(a.question.topic, t);
    }
    const latestTopics = [...m.entries()].map(([topic, t]) => ({ topic, avg: round1(t.sum / t.n) })).sort((x, y) => x.avg - y.avg);
    if (latestTopics.length > 0 && latestTopics[0].avg < 100) {
      nextFocus = { topic: latestTopics[0].topic, avgScore: latestTopics[0].avg };
    }
  }

  // Strongest/weakest only when the comparison is meaningful: at least two
  // topics with data.
  const strongest = topics.length >= 2 ? topics[0].topic : null;
  const weakest = topics.length >= 2 ? topics[topics.length - 1].topic : null;

  return {
    completedCount: completedInterviews.length,
    scoredCount: perInterview.size,
    answeredTotal: answeredInCompleted,
    avgScore:
      interviewScores.length === 0
        ? null
        : round1(interviewScores.reduce((s, v) => s + v, 0) / interviewScores.length),
    bestScore: interviewScores.length === 0 ? null : Math.max(...interviewScores),
    verdicts,
    trend,
    topics,
    topicTrends,
    recurringWeak,
    nextFocus,
    strongest,
    weakest,
  };
}

// Dashboard statistics, all derived from persisted records.
//
// Documented score method (used consistently by /stats, /results and the
// history list): an interview's OVERALL SCORE is the mean of its answers'
// evaluation scores, rounded to 1 decimal, and exists only when at least one
// answer has an evaluation. Unanswered questions never count as zero.
// The candidate's AVERAGE score is the mean of those interview scores.
export async function getInterviewStats(userId) {
  const [byStatus, completed, evaluatedAnswers, answeredTotal] = await Promise.all([
    prisma.interview.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.interview.findMany({
      where: { userId, status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
      select: { id: true, roleTitle: true, startedAt: true, completedAt: true },
      orderBy: { completedAt: "desc" },
    }),
    // One pass over evaluated answers: per-interview sums, no N+1.
    prisma.answer.findMany({
      where: { interview: { userId }, evaluation: { isNot: null } },
      select: { interviewId: true, evaluation: { select: { score: true } } },
    }),
    prisma.answer.count({ where: { interview: { userId } } }),
  ]);

  const round1 = (n) => Math.round(n * 10) / 10;
  const countFor = (status) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  const perInterview = new Map(); // interviewId -> { sum, n }
  for (const a of evaluatedAnswers) {
    const entry = perInterview.get(a.interviewId) ?? { sum: 0, n: 0 };
    entry.sum += a.evaluation.score;
    entry.n += 1;
    perInterview.set(a.interviewId, entry);
  }
  const interviewScore = (id) => {
    const e = perInterview.get(id);
    return e ? round1(e.sum / e.n) : null;
  };

  const interviewScores = [...perInterview.values()].map((e) => round1(e.sum / e.n));
  const avgScore =
    interviewScores.length === 0
      ? null
      : round1(interviewScores.reduce((s, v) => s + v, 0) / interviewScores.length);
  const bestScore = interviewScores.length === 0 ? null : Math.max(...interviewScores);

  const practiceMinutes = completed.reduce((sum, i) => {
    const mins = (i.completedAt - i.startedAt) / 60000;
    return sum + Math.max(0, Math.round(mins));
  }, 0);

  // Recent scored, completed interviews for the trend chart (oldest first
  // for plotting). Unscored completed interviews are excluded rather than
  // plotted as zero.
  const recentScores = completed
    .filter((i) => perInterview.has(i.id))
    .slice(0, 8)
    .map((i) => ({
      id: i.id,
      roleTitle: i.roleTitle,
      score: interviewScore(i.id),
      completedAt: i.completedAt,
    }))
    .reverse();

  return {
    total,
    drafts: countFor("PENDING"),
    inProgress: countFor("IN_PROGRESS"),
    completed: countFor("COMPLETED"),
    avgScore,
    bestScore,
    answeredTotal,
    practiceMinutes,
    recentScores,
  };
}

// RETAKE: creates a fresh PENDING interview from an existing one's saved
// configuration. The old attempt and everything hanging off it (questions,
// answers, follow-ups, evaluations, report) are never touched. A 15-second
// dedupe window on identical config + PENDING status makes accidental
// double-clicks or network retries return the same new attempt instead of
// creating duplicates; deliberately starting two identical configs after
// that window is still allowed.
const RETAKE_DEDUPE_WINDOW_MS = 15000;

export async function retakeInterview(userId, interviewId) {
  const source = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!source) throw new HttpError(404, "NOT_FOUND", "Interview not found.");

  const dedupeCutoff = new Date(Date.now() - RETAKE_DEDUPE_WINDOW_MS);
  const recentDuplicate = await prisma.interview.findFirst({
    where: {
      userId,
      // Exclude the source itself: retaking a still-PENDING draft must
      // create a new attempt, not return the draft.
      id: { not: interviewId },
      status: "PENDING",
      createdAt: { gte: dedupeCutoff },
      roleTitle: source.roleTitle,
      experienceLevel: source.experienceLevel,
      interviewType: source.interviewType,
      difficulty: source.difficulty,
      mode: source.mode,
      questionCount: source.questionCount,
      durationMinutes: source.durationMinutes,
    },
    orderBy: { createdAt: "desc" },
  });
  if (recentDuplicate) return recentDuplicate;

  // Never copy questions, answers, evaluations or the report — only the
  // configuration the candidate chose.
  return prisma.interview.create({
    data: {
      userId,
      roleTitle: source.roleTitle,
      experienceLevel: source.experienceLevel,
      interviewType: source.interviewType,
      difficulty: source.difficulty,
      mode: source.mode,
      topics: source.topics,
      questionCount: source.questionCount,
      durationMinutes: source.durationMinutes,
      status: "PENDING",
    },
    select: INTERVIEW_SELECT,
  });
}

// COMPARE: two completed, owned attempts side by side. Comparability is
// derived from the persisted configurations and reported honestly — the
// score deltas are shown with caveats when the attempts differ.
export async function compareInterviews(userId, interviewId, otherId) {
  if (interviewId === otherId) {
    throw new HttpError(422, "SAME_INTERVIEW", "Pick two different interviews to compare.");
  }
  const ids = [interviewId, otherId];
  const rows = await prisma.interview.findMany({
    where: { id: { in: ids }, userId, status: "COMPLETED" },
    include: {
      questions: {
        orderBy: [{ questionOrder: "asc" }, { isFollowUp: "asc" }, { followUpIndex: "asc" }],
        select: {
          questionOrder: true, isFollowUp: true, followUpIndex: true,
          topic: true, text: true,
          answer: { select: { evaluation: { select: { score: true } } } },
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    if (!byId.has(id)) throw new HttpError(404, "NOT_FOUND", "Interview not found (or not completed).");
  }

  const summarize = (row) => {
    const scores = row.questions
      .map((q) => q.answer?.evaluation?.score)
      .filter((v) => typeof v === "number");
    const byTopic = new Map();
    for (const q of row.questions) {
      const score = q.answer?.evaluation?.score;
      if (typeof score !== "number") continue;
      const t = byTopic.get(q.topic) ?? { sum: 0, n: 0 };
      t.sum += score;
      t.n += 1;
      byTopic.set(q.topic, t);
    }
    const topicScores = [...byTopic.entries()]
      .map(([topic, t]) => ({ topic, answered: t.n, avgScore: Math.round((t.sum / t.n) * 10) / 10 }))
      .sort((a, b) => b.avgScore - a.avgScore);
    return {
      id: row.id,
      roleTitle: row.roleTitle,
      experienceLevel: row.experienceLevel,
      interviewType: row.interviewType,
      difficulty: row.difficulty,
      topics: row.topics,
      completedAt: row.completedAt,
      questionCount: row.questionCount,
      avgScore: scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      evaluatedCount: scores.length,
      topicScores,
    };
  };

  const a = summarize(byId.get(interviewId));
  const b = summarize(byId.get(otherId));

  // Honest comparability: what matches and what differs between the two runs.
  const sameRole = a.roleTitle === b.roleTitle;
  const sameType = a.interviewType === b.interviewType;
  const sameDifficulty = a.difficulty === b.difficulty;
  const sharedTopics = a.topics.filter((t) => b.topics.includes(t));
  const bOnlyTopics = b.topics.filter((t) => !a.topics.includes(t));
  const aOnlyTopics = a.topics.filter((t) => !b.topics.includes(t));

  return {
    a,
    b,
    comparability: {
      sameRole,
      sameType,
      sameDifficulty,
      sharedTopics,
      differingTopics: { onlyInFirst: aOnlyTopics, onlyInSecond: bOnlyTopics },
      comparable: sameRole && sameType && sameDifficulty && sharedTopics.length > 0,
    },
  };
}