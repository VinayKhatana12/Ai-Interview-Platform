// Whole-interview AI feedback + prioritized improvement plan.
//
// Lifecycle: POST /:id/feedback (after completion) ensures every answer is
// evaluated, then generates the report ONCE from persisted records and
// stores it. The unique index on interviewId makes generation DB-idempotent
// — retried or concurrent requests return the existing report instead of
// regenerating. GET /:id/results serves it as part of the pure read.
//
// Grounding: the AI receives the persisted questions (planned + follow-ups),
// the candidate's actual answers, and the saved per-answer evaluations. The
// zod schema FORBIDS numeric skill scores in the report — the only numbers
// shown are the documented per-answer evaluations; qualitative judgments
// must carry evidence strings.
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/HttpError.js";
import { AiError, aiGenerateInterviewFeedback } from "./ai/provider.js";
import { evaluateInterview } from "./evaluation.service.js";

function notFound() {
  return new HttpError(404, "NOT_FOUND", "Interview not found.");
}

// Trusted context for the AI: persisted questions (planned + follow-ups,
// in interview order) with the candidate's actual answers and the saved
// per-answer evaluations.
function buildContext(interviewId) {
  return prisma.question.findMany({
    where: { interviewId },
    orderBy: [{ questionOrder: "asc" }, { isFollowUp: "asc" }, { followUpIndex: "asc" }],
    select: {
      questionOrder: true,
      isFollowUp: true,
      followUpIndex: true,
      text: true,
      topic: true,
      questionType: true,
      answer: {
        select: {
          responseText: true,
          evaluation: { select: { score: true, correctness: true, feedback: true } },
        },
      },
    },
  });
}

export async function generateInterviewFeedback(userId, interviewId) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw notFound();
  if (interview.status !== "COMPLETED") {
    throw new HttpError(409, "NOT_COMPLETE", "Finish the interview before requesting the feedback report.");
  }

  // DB-idempotent: a stored report is returned as-is, never regenerated.
  const existing = await prisma.interviewReport.findUnique({ where: { interviewId } });
  if (existing) return existing;

  // Make sure every answer has its per-answer evaluation first — the report
  // is grounded in those. Reuses the idempotent evaluate pipeline; failures
  // (provider down) surface as a retryable 409.
  const evaluated = await evaluateInterview(userId, interviewId);
  if (evaluated.failures.length > 0 || evaluated.evaluatedCount < evaluated.totalAnswered) {
    throw new HttpError(
      409,
      "EVALUATIONS_INCOMPLETE",
      "Some answers could not be evaluated yet. Retry in a moment — already-evaluated answers are kept.",
    );
  }

  const entries = evaluated.items.map((i) => ({
    order: i.question.order,
    isFollowUp: i.question.isFollowUp,
    followUpIndex: i.question.followUpIndex,
    topic: i.question.topic,
    questionType: i.question.questionType,
    questionText: i.question.text,
    answerText: i.answer?.responseText ?? "",
    score: i.evaluation?.score ?? 0,
    correctness: i.evaluation?.correctness ?? "INCORRECT",
    feedback: i.evaluation?.feedback ?? "",
  }));

  let report;
  try {
    report = await aiGenerateInterviewFeedback({
      roleTitle: interview.roleTitle,
      experienceLevel: interview.experienceLevel,
      interviewType: interview.interviewType,
      difficulty: interview.difficulty,
      topics: interview.topics,
      durationMinutes: interview.durationMinutes,
      entries,
    });
  } catch (err) {
    // Typed AiErrors and unexpected provider crashes both map to the same
    // retryable 503 — never a 500 with internals.
    if (!(err instanceof AiError)) {
      console.error("[feedback] unexpected failure:", err?.code ?? err?.constructor?.name);
    }
    throw new HttpError(
      503,
      "REPORT_GENERATION_FAILED",
      "The feedback report could not be generated right now. Try again in a moment.",
    );
  }

  try {
    return await prisma.interviewReport.create({
      data: {
        interviewId,
        summary: report.summary,
        strengths: report.strengths,
        improvements: report.improvements,
        skillNotes: report.skillNotes,
        plan: report.plan,
        modelUsed: env.AI_MODEL,
      },
    });
  } catch (err) {
    // Concurrent request hit the unique interviewId — return the winner.
    if (err?.code === "P2002") {
      return prisma.interviewReport.findUnique({ where: { interviewId } });
    }
    throw err;
  }
}
