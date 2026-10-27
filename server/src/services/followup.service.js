// Adaptive follow-up questions.
//
// Flow: after an answer is submitted and persisted, the client calls
// POST /:id/followup for the answered question. This service decides — via
// the AI provider — whether one follow-up is warranted, and if so persists
// it as a child Question row. The server owns every decision: ownership,
// whether the question is answered, how many follow-ups exist, and whether
// one is warranted. The client can only ask.
//
// LIMITS: at most env.FOLLOWUP_MAX_PER_QUESTION (default 2) follow-ups per
// ORIGINAL planned question, counted across the whole chain (a follow-up of
// a follow-up counts toward the same budget). After the limit, the endpoint
// answers 409 and the interview continues to the next planned question.
//
// IDEMPOTENCY: the unique index on (parentQuestionId, followUpIndex) makes
// retried requests return the already-generated follow-up instead of
// duplicating it.
//
// ORDERING: a follow-up copies its original question's questionOrder and
// carries followUpIndex 1..N, so the parent-aware session ordering places
// it directly after its parent and before the next planned question.
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/HttpError.js";
import { AiError, aiDecideFollowUp } from "./ai/provider.js";
import { isAiConfigured } from "./questionGenerator.js";
import { buildSessionView } from "./interviewSession.service.js";

function notFound() {
  return new HttpError(404, "NOT_FOUND", "Interview not found.");
}

// The original planned question a follow-up belongs to: the question
// itself when planned, otherwise its chain's root.
function originalOf(question) {
  return question.isFollowUp && question.parentQuestionId ? question.parentQuestionId : question.id;
}

export async function generateFollowUp(userId, interviewId, questionId) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw notFound();
  if (interview.status === "PENDING") {
    throw new HttpError(409, "NOT_STARTED", "Answer a question before asking for a follow-up.");
  }
  if (interview.status === "COMPLETED") {
    throw new HttpError(409, "ALREADY_COMPLETED", "This interview is already completed.");
  }
  const deadline = interview.startedAt.getTime() + interview.durationMinutes * 60000 + 60000;
  if (Date.now() > deadline) {
    throw new HttpError(409, "TIME_EXPIRED", "Time is up for this interview.");
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, interviewId },
    include: {
      answer: { select: { responseText: true, evaluation: { select: { score: true, correctness: true, feedback: true } } } },
    },
  });
  if (!question) throw new HttpError(404, "NOT_FOUND", "Question not found.");
  if (!question.answer) {
    throw new HttpError(409, "FOLLOWUP_NOT_ALLOWED", "A follow-up needs a submitted answer to this question.");
  }

  const originalId = originalOf(question);
  const chain = await prisma.question.findMany({
    // The whole chain shares the original's questionOrder.
    where: { interviewId, questionOrder: question.questionOrder },
    orderBy: { followUpIndex: "asc" },
    include: { answer: { select: { responseText: true } } },
  });
  const original = chain.find((q) => !q.isFollowUp);
  const priorFollowUps = chain.filter((q) => q.isFollowUp);
  const max = env.FOLLOWUP_MAX_PER_QUESTION;

  if (!isAiConfigured()) {
    return {
      followUp: null,
      note: "Follow-up questions need the AI provider configured on the server.",
      session: await buildSessionView(userId, interviewId),
    };
  }
  if (max === 0) {
    return {
      followUp: null,
      note: "Follow-up questions are disabled.",
      session: await buildSessionView(userId, interviewId),
    };
  }
  if (priorFollowUps.length >= max) {
    throw new HttpError(
      409,
      "FOLLOWUP_LIMIT",
      `This question already has the maximum of ${max} follow-up${max === 1 ? "" : "s"}. Continue to the next question.`,
    );
  }

  // Retry short-circuit: when the current question is this original's own
  // unanswered follow-up, a retried request IS that follow-up — return it
  // without spending another AI call.
  const frontier = await buildSessionView(userId, interviewId);
  if (
    frontier.currentQuestion?.isFollowUp &&
    frontier.currentQuestion.order === question.questionOrder
  ) {
    return {
      followUp: {
        id: frontier.currentQuestion.id,
        order: frontier.currentQuestion.order,
        followUpIndex: frontier.currentQuestion.followUpIndex,
      },
      note: null,
      session: frontier,
    };
  }

  // Answer history for the decision: everything the candidate actually said
  // in this chain, from persisted records only.
  const priorChain = chain
    .filter((q) => q.answer)
    .map((q) => ({ questionText: q.text, answerText: q.answer.responseText }));
  const answeredQuestion = question.answer;

  let decision;
  try {
    decision = await aiDecideFollowUp({
      roleTitle: interview.roleTitle,
      experienceLevel: interview.experienceLevel,
      interviewType: interview.interviewType,
      difficulty: interview.difficulty,
      topic: question.topic,
      originalQuestion: original?.text ?? question.text,
      answerText: answeredQuestion.responseText,
      priorChain,
      evaluation: answeredQuestion.evaluation ?? null,
    });
  } catch (err) {
    // Provider failure never loses the answer: the response carries the
    // advanced session and a retryable note instead of an error status.
    const code = err instanceof AiError ? err.code : "INTERNAL";
    console.error(`[followup] decision failed (${code})`);
    return {
      followUp: null,
      note: "The interviewer could not prepare a follow-up right now. You can retry, or continue to the next question.",
      session: await buildSessionView(userId, interviewId),
    };
  }

  if (!decision.warranted || !decision.questionText) {
    // A clear, complete answer: proceed directly to the next question.
    return { followUp: null, note: null, session: await buildSessionView(userId, interviewId) };
  }

  const followUpIndex = priorFollowUps.length + 1;
  try {
    // Transaction: create the follow-up and read back the advanced state so
    // a retried request either sees the unique-index guard or the row.
    const created = await prisma.$transaction(async (tx) => {
      return tx.question.create({
        data: {
          interviewId,
          text: decision.questionText,
          topic: question.topic,
          difficulty: question.difficulty,
          questionOrder: question.questionOrder,
          questionType: question.questionType,
          isFollowUp: true,
          followUpIndex,
          parentQuestionId: originalId,
        },
      });
    });
    return {
      followUp: { id: created.id, order: created.questionOrder, followUpIndex: created.followUpIndex },
      note: null,
      session: await buildSessionView(userId, interviewId),
    };
  } catch (err) {
    // Concurrent retry hit the (parentQuestionId, followUpIndex) unique —
    // the follow-up already exists, so return it (idempotent).
    if (err?.code === "P2002") {
      const existing = await prisma.question.findFirst({
        where: { parentQuestionId: originalId, followUpIndex },
      });
      return {
        followUp: { id: existing.id, order: existing.questionOrder, followUpIndex: existing.followUpIndex },
        note: null,
        session: await buildSessionView(userId, interviewId),
      };
    }
    throw err;
  }
}

