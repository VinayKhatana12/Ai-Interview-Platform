// Server-controlled interview state machine:
//
//   PENDING --start--> IN_PROGRESS --(all answered or time expired)+complete--> COMPLETED
//
// Every transition is validated here against the database, never against
// client-supplied status. Question order is server-controlled: the current
// question is always the lowest-ordered question without an answer.
// One-answer-per-question is enforced by the unique index on
// answers.question_id, which is also the retry-idempotency mechanism: a
// repeated submit of the same question returns the recorded state instead of
// creating a second row.
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/HttpError.js";
import { generateQuestions, isAiConfigured } from "./questionGenerator.js";
import { AiError } from "./ai/provider.js";

// Extra seconds accepted after the deadline so slow networks or modest clock
// skew never eats a candidate's answer. The view still shows the true expiry.
const SUBMIT_GRACE_SECONDS = 60;

function conflict(code, message) {
  return new HttpError(409, code, message);
}

function notFound() {
  return new HttpError(404, "NOT_FOUND", "Interview not found.");
}

async function getOwnedInterview(userId, id) {
  // Ownership as a where-clause: another user's interview reads as 404.
  const interview = await prisma.interview.findFirst({ where: { id, userId } });
  if (!interview) throw notFound();
  return interview;
}

function deadlineFor(interview) {
  return new Date(interview.startedAt.getTime() + interview.durationMinutes * 60000);
}

// One shared view used by the session endpoint and every mutation response,
// so the client always advances from persisted truth.
async function buildSessionView(userId, interviewId) {
  const [interview, questions, answers] = await Promise.all([
    prisma.interview.findFirst({ where: { id: interviewId, userId } }),
    prisma.question.findMany({
      where: { interviewId },
      orderBy: [{ questionOrder: "asc" }, { isFollowUp: "asc" }, { followUpIndex: "asc" }],
      select: {
        id: true,
        questionOrder: true,
        text: true,
        topic: true,
        difficulty: true,
        questionType: true,
        isFollowUp: true,
        followUpIndex: true,
        answer: { select: { id: true } },
      },
    }),
    prisma.answer.count({ where: { interviewId } }),
  ]);
  if (!interview) throw notFound();

  // Progress counts planned questions only; follow-ups are extra depth on
  // an existing question and are shown through their own label instead.
  // Progress counts planned questions only; follow-ups are extra depth on
  // an existing question and are shown through their own label instead.
  // The planned total is the configured questionCount — true before start
  // (no rows yet) and after (the generator enforces the exact count).
  const plannedQuestions = questions.filter((q) => !q.isFollowUp);
  const answered = plannedQuestions.filter((q) => q.answer).length;
  const total = interview.questionCount;
  // Current question: the first unanswered question in interview order —
  // planned questions at their position, each follow-up directly after the
  // question it belongs to. (Follow-ups exist only after their parent is
  // answered, so this ordering is always a valid progression.)
  const firstUnanswered = questions.find((q) => !q.answer);
  const now = Date.now();
  const deadline = interview.startedAt ? deadlineFor(interview).getTime() : null;
  const timeExpired = deadline != null && now > deadline + SUBMIT_GRACE_SECONDS * 1000;

  let phase;
  if (interview.status === "PENDING") phase = "ready";
  else if (interview.status === "COMPLETED") phase = "completed";
  else if (firstUnanswered == null) phase = "all_answered";
  else phase = "in_progress";

  const currentQuestion = firstUnanswered
    ? {
        id: firstUnanswered.id,
        order: firstUnanswered.questionOrder,
        text: firstUnanswered.text,
        topic: firstUnanswered.topic,
        difficulty: firstUnanswered.difficulty,
        questionType: firstUnanswered.questionType,
        isFollowUp: firstUnanswered.isFollowUp,
        followUpIndex: firstUnanswered.followUpIndex,
        followUpLimit: env.FOLLOWUP_MAX_PER_QUESTION,
      }
    : null;

  return {
    interview: {
      id: interview.id,
      roleTitle: interview.roleTitle,
      interviewType: interview.interviewType,
      mode: interview.mode,
      topics: interview.topics,
      difficulty: interview.difficulty,
      status: interview.status,
      durationMinutes: interview.durationMinutes,
      questionCount: interview.questionCount,
      startedAt: interview.startedAt,
      completedAt: interview.completedAt,
    },
    phase,
    // Honest labeling: which generator produced the question set.
    questionSource: isAiConfigured() ? "ai" : "fixture",
    progress: { answered, total },
    currentQuestion,
    timeExpired,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    serverNow: new Date().toISOString(),
  };
}

// POST /:id/start — PENDING -> IN_PROGRESS. Generates the question set from
// the persisted configuration, then saves set + status in one transaction.
// REGENERATION POLICY: a set is generated exactly once per interview, at
// start. There is no regenerate endpoint — an existing set is immutable
// (answers and progress may already hang off it). A failed generation saves
// nothing, so the only retry is "start again" on the still-PENDING
// interview, which lands here and generates fresh.
export async function startInterview(userId, interviewId) {
  const interview = await getOwnedInterview(userId, interviewId);
  if (interview.status !== "PENDING") {
    throw conflict("ALREADY_STARTED", "This interview has already been started.");
  }

  const existingCount = await prisma.question.count({ where: { interviewId } });
  if (existingCount === 0) {
    let questions;
    try {
      questions = await generateQuestions({
        roleTitle: interview.roleTitle,
        experienceLevel: interview.experienceLevel,
        difficulty: interview.difficulty,
        interviewType: interview.interviewType,
        topics: interview.topics,
        questionCount: interview.questionCount,
        durationMinutes: interview.durationMinutes,
      });
    } catch (err) {
      // Provider failure is recoverable: nothing was persisted, the
      // interview stays PENDING, and starting again retries generation.
      // Typed AiErrors and unexpected provider crashes map to the same 503.
      if (!(err instanceof AiError)) {
        console.error("[question generation] unexpected failure:", err);
      }
      throw new HttpError(
        503,
        "GENERATION_FAILED",
        "The AI question generator is unavailable right now. Try starting again in a moment.",
      );
    }
    if (!Array.isArray(questions) || questions.length !== interview.questionCount) {
      // A provider bug must never start an interview it cannot fill.
      throw new HttpError(503, "GENERATION_FAILED", "Could not build the question set. Try again.");
    }
    // The slow AI call stays OUTSIDE the transaction; the two writes below
    // land atomically, so a crash can never leave a saved set on a
    // still-PENDING interview, or a started interview with no set.
    await prisma.$transaction([
      prisma.question.createMany({
        data: questions.map((q, i) => ({
          interviewId,
          text: q.text,
          topic: q.topic,
          difficulty: q.difficulty,
          questionOrder: i + 1,
          questionType: q.questionType,
        })),
      }),
      prisma.interview.update({
        where: { id: interviewId },
        data: { status: "IN_PROGRESS", startedAt: interview.startedAt ?? new Date() },
      }),
    ]);
  } else {
    // Questions already exist (a retried start after a saved set): only the
    // transition persists; the saved set is never touched.
    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "IN_PROGRESS", startedAt: interview.startedAt ?? new Date() },
    });
  }

  return buildSessionView(userId, interviewId);
}

// POST /:id/answers — persists one answer and returns the advanced view.
export async function submitAnswer(userId, interviewId, { questionId, responseText }) {
  const interview = await getOwnedInterview(userId, interviewId);
  if (interview.status === "PENDING") {
    throw conflict("NOT_STARTED", "Start the interview before submitting answers.");
  }
  if (interview.status === "COMPLETED") {
    throw conflict("ALREADY_COMPLETED", "This interview is already completed.");
  }

  const questions = await prisma.question.findMany({
    where: { interviewId },
    orderBy: [{ questionOrder: "asc" }, { isFollowUp: "asc" }, { followUpIndex: "asc" }],
    include: { answer: { select: { id: true, submittedAt: true } } },
  });
  const target = questions.find((q) => q.id === questionId);
  if (!target) {
    throw new HttpError(422, "UNKNOWN_QUESTION", "This question is not part of the interview.");
  }

  // Idempotent retry: the question was already answered — return the recorded
  // state (first submission wins) instead of a second row or an error.
  if (target.answer) {
    const view = await buildSessionView(userId, interviewId);
    return { ...view, alreadyRecorded: true };
  }

  // Server-controlled order: only the first unanswered question is submittable.
  const current = questions.find((q) => !q.answer);
  if (!current || current.id !== questionId) {
    throw conflict("OUT_OF_ORDER", "Answer the current question before moving on.");
  }

  const deadline = deadlineFor(interview).getTime() + SUBMIT_GRACE_SECONDS * 1000;
  if (Date.now() > deadline) {
    throw conflict("TIME_EXPIRED", "Time is up for this interview. Finish it to see your results.");
  }

  // Per-question timing: the clock starts when this question became current
  // (the previous answer's submission, or the interview start), not when the
  // question row was created — otherwise later questions inherit all the
  // earlier answering time.
  const priorSubmitAt = questions
    .filter(
      (q) =>
        q.answer &&
        (q.questionOrder < target.questionOrder ||
          (q.questionOrder === target.questionOrder && q.followUpIndex < target.followUpIndex)),
    )
    .reduce((latest, q) => (q.answer.submittedAt > latest ? q.answer.submittedAt : latest), interview.startedAt)
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - priorSubmitAt.getTime()) / 1000))

  // Persist before responding — success means the answer is in the database.
  // The unique index on answers.question_id also covers the concurrent
  // double-submit race: both requests may pass the checks above, but only
  // one row can exist; the loser returns the recorded state instead of 500.
  try {
    await prisma.answer.create({
      data: {
        questionId,
        interviewId,
        responseText,
        timeTakenSeconds: elapsedSeconds,
      },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      const view = await buildSessionView(userId, interviewId);
      return { ...view, alreadyRecorded: true };
    }
    throw err;
  }

  const view = await buildSessionView(userId, interviewId);
  return { ...view, alreadyRecorded: false };
}

// POST /:id/complete — IN_PROGRESS -> COMPLETED. Completion is granted only
// when the database agrees: every question answered, or the clock ran out.
// Client-claimed status is never consulted.
export async function completeInterview(userId, interviewId) {
  const interview = await getOwnedInterview(userId, interviewId);
  if (interview.status === "COMPLETED") {
    return buildSessionView(userId, interviewId); // idempotent
  }
  if (interview.status !== "IN_PROGRESS") {
    throw conflict("NOT_STARTED", "Start the interview before completing it.");
  }

  const [total, answered] = await Promise.all([
    prisma.question.count({ where: { interviewId } }),
    prisma.answer.count({ where: { interviewId } }),
  ]);
  const deadline = deadlineFor(interview).getTime() + SUBMIT_GRACE_SECONDS * 1000;
  const allAnswered = total > 0 && answered === total;
  const timeExpired = Date.now() > deadline;

  if (!allAnswered && !timeExpired) {
    throw conflict(
      "NOT_COMPLETE",
      `All questions must be answered or time must run out (${answered} of ${total} answered).`,
    );
  }

  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return buildSessionView(userId, interviewId);
}

export { buildSessionView };
