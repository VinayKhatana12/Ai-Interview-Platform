// Answer evaluation. Deliberately decoupled from the interview state
// machine: evaluating never changes interview status, and completing never
// waits for evaluation. Evaluations are one-per-answer (unique answerId),
// so re-running the endpoint evaluates only what is missing — retries are
// safe and never duplicate rows.
import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";
import { AiError, aiEvaluateAnswer, isAiConfigured } from "./ai/provider.js";
import { fixtureEvaluation } from "./evaluationFixture.js";

const EVALUATION_CONCURRENCY = 3;

function notFound() {
  return new HttpError(404, "NOT_FOUND", "Interview not found.");
}

// Results view: questions in stable order, each with its answer and
// evaluation (null while unevaluated). The disclaimer travels with the data
// so every consumer labels the feedback the same way.
async function buildResultsView(userId, interviewId) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw notFound();

  const rows = await prisma.question.findMany({
    where: { interviewId },
    orderBy: { questionOrder: "asc" },
    include: {
      answer: {
        include: { evaluation: true },
      },
    },
  });

  const items = rows.map((q) => ({
    question: {
      id: q.id,
      order: q.questionOrder,
      text: q.text,
      topic: q.topic,
      difficulty: q.difficulty,
      questionType: q.questionType,
    },
    answer: q.answer
      ? {
          id: q.answer.id,
          responseText: q.answer.responseText,
          timeTakenSeconds: q.answer.timeTakenSeconds,
          submittedAt: q.answer.submittedAt,
        }
      : null,
    evaluation: q.answer?.evaluation
      ? {
          score: q.answer.evaluation.score,
          correctness: q.answer.evaluation.correctness,
          feedback: q.answer.evaluation.feedback,
          strengths: q.answer.evaluation.strengths,
          improvements: q.answer.evaluation.improvements,
          modelAnswer: q.answer.evaluation.modelAnswer,
        }
      : null,
  }));

  const scores = items.map((i) => i.evaluation?.score).filter((s) => typeof s === "number");
  const avgScore =
    scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  // Suggested practice topics, derived from the evaluations themselves (no
  // extra AI call, nothing invented): topics averaging under 70, weakest
  // first. null while feedback is incomplete; [] means nothing was weak.
  let practiceSuggestions = null;
  const answeredItems = items.filter((i) => i.answer);
  const allEvaluated = answeredItems.length > 0 && answeredItems.every((i) => i.evaluation);
  if (allEvaluated) {
    const byTopic = new Map();
    for (const item of answeredItems) {
      const entry = byTopic.get(item.question.topic) ?? { scores: [] };
      entry.scores.push(item.evaluation.score);
      byTopic.set(item.question.topic, entry);
    }
    practiceSuggestions = [...byTopic.entries()]
      .map(([topic, { scores: ts }]) => ({
        topic,
        avgScore: Math.round((ts.reduce((a, b) => a + b, 0) / ts.length) * 10) / 10,
        questions: ts.length,
      }))
      .filter((t) => t.avgScore < 70)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 3)
      .map((t) => ({
        ...t,
        reason: `Averaged ${t.avgScore.toFixed(1)} across ${t.questions} ${t.questions === 1 ? "question" : "questions"}`,
      }));
  }

  return {
    interview: {
      id: interview.id,
      roleTitle: interview.roleTitle,
      difficulty: interview.difficulty,
      status: interview.status,
      startedAt: interview.startedAt,
      completedAt: interview.completedAt,
      questionCount: interview.questionCount,
    },
    items,
    evaluatedCount: scores.length,
    totalAnswered: items.filter((i) => i.answer).length,
    avgScore,
    practiceSuggestions,
    feedbackSource: isAiConfigured() ? "ai" : "fixture",
    disclaimer:
      "AI-generated practice feedback. It is a signal for your preparation, not a guaranteed hiring outcome.",
  };
}

async function evaluateOne(interview, question, answer) {
  const result = isAiConfigured()
    ? await aiEvaluateAnswer({
        roleTitle: interview.roleTitle,
        experienceLevel: interview.experienceLevel,
        difficulty: question.difficulty,
        topic: question.topic,
        questionText: question.text,
        answerText: answer.responseText,
      })
    : fixtureEvaluation({
        questionText: question.text,
        answerText: answer.responseText,
      });

  try {
    await prisma.evaluation.create({
      data: {
        answerId: answer.id,
        score: result.score,
        correctness: result.correctness,
        feedback: result.feedback,
        strengths: result.strengths,
        improvements: result.improvements,
        modelAnswer: result.modelAnswer,
      },
    });
  } catch (err) {
    // Concurrent evaluate runs race on the unique answerId; the row exists,
    // which is the outcome this function promises.
    if (err?.code === "P2002") return { ok: true };
    throw err;
  }
  return { ok: true };
}

// POST /:id/evaluate — evaluates every unevaluated answer of the owner's
// COMPLETED interview. Status never changes here. Per-answer failures are
// reported, not swallowed; a retry evaluates only the missing ones.
export async function evaluateInterview(userId, interviewId) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw notFound();
  if (interview.status !== "COMPLETED") {
    throw new HttpError(409, "NOT_COMPLETE", "Finish the interview before requesting feedback.");
  }

  const rows = await prisma.question.findMany({
    where: { interviewId },
    orderBy: { questionOrder: "asc" },
    include: { answer: { include: { evaluation: { select: { id: true } } } } },
  });

  const pending = rows.filter((q) => q.answer && !q.answer.evaluation);
  const failures = [];

  const queue = [...pending];
  async function worker() {
    while (queue.length > 0) {
      const q = queue.shift();
      try {
        await evaluateOne(interview, q, q.answer);
      } catch (err) {
        // AiErrors carry our own client-safe messages; anything else is
        // logged server-side and reported generically so Prisma/provider
        // internals never reach the client.
        const isOurs = err instanceof AiError
        const code = isOurs ? err.code : "INTERNAL"
        if (!isOurs) console.error(`[evaluation] answer ${q.answer.id} failed:`, err?.code ?? err?.constructor?.name)
        failures.push({
          questionOrder: q.questionOrder,
          code,
          message: isOurs ? err.message : "This answer could not be evaluated. Retry keeps already-evaluated answers.",
        })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EVALUATION_CONCURRENCY, Math.max(1, pending.length)) }, worker));

  const view = await buildResultsView(userId, interviewId);
  return {
    ...view,
    failures,
  };
}

export { buildResultsView };
