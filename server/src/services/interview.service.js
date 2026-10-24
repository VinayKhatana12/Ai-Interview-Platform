import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";

// Shape returned by list/detail: config plus a derived score — the mean of
// the answer evaluations that exist, null when none do.
const INTERVIEW_SELECT = {
  id: true,
  roleTitle: true,
  experienceLevel: true,
  difficulty: true,
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

export async function listInterviews(userId, { page, pageSize }) {
  const where = { userId };
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

export async function getInterviewStats(userId) {
  const [byStatus, completed, evaluations] = await Promise.all([
    prisma.interview.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.interview.findMany({
      where: { userId, status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
    }),
    prisma.answer.findMany({
      where: { interview: { userId }, evaluation: { isNot: null } },
      select: { evaluation: { select: { score: true } } },
    }),
  ]);

  const countFor = (status) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const scores = evaluations.map((a) => a.evaluation.score);
  const avgScore =
    scores.length === 0
      ? null
      : Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
  const practiceMinutes = completed.reduce((sum, i) => {
    const mins = (i.completedAt - i.startedAt) / 60000;
    return sum + Math.max(0, Math.round(mins));
  }, 0);

  return {
    total,
    drafts: countFor("PENDING"),
    inProgress: countFor("IN_PROGRESS"),
    completed: countFor("COMPLETED"),
    avgScore,
    practiceMinutes,
  };
}
