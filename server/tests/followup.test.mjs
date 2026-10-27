// Adaptive follow-up tests. The decision AI is MOCKED (vi.mock of
// geminiClient, same pattern as ai.test.mjs) — no credits, no network.
// Covers the 12 spec cases: no-follow-up for strong answers, warranted
// follow-ups, the limit, follow-up answer persistence + evaluation,
// idempotent retries, malformed provider responses, ownership, progression,
// completion, and report/analytics integration.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

vi.mock("../src/services/ai/geminiClient.js", () => ({
  AiError: class AiError extends Error {
    constructor(code, message, opts = {}) {
      super(message);
      this.code = code;
      this.status = opts.status ?? 503;
    }
  },
  generateJson: vi.fn(),
}));

import { generateJson } from "../src/services/ai/geminiClient.js";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const USER_A = { name: "Followup Owner", email: "followup-owner@example.com", password: "password-1a" };
const USER_B = { name: "Followup Other", email: "followup-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Followup Target",
  experienceLevel: "1-3",
  difficulty: "MEDIUM",
  interviewType: "TECHNICAL",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 30,
};

// Distinct planned questions (near-duplicate guard rejects digit variants).
const PLAN = {
  questions: [
    { text: "Explain how the component lifecycle works and when re-renders happen.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Describe how the framework handles asynchronous work and error recovery.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Compare client-side and server-side rendering for this kind of app.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
  ],
};

const STRONG_DECISION = { warranted: false, questionText: "" };
const FOLLOWUP_DECISION = {
  warranted: true,
  questionText: "You mentioned reconciliation handles updates. How does the reconciler decide when to reuse a component instance versus remount it?",
};
const FOLLOWUP_DECISION_2 = {
  warranted: true,
  questionText: "Earlier you said key reuse matters. What specifically breaks when keys are unstable across renders?",
};

let cookieA = "";
let cookieB = "";
let interviewId = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

async function setupInterview() {
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  const id = created.body.interview.id;
  await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookieA);
  return id;
}

function answer(questionId, text) {
  return request(app)
    .post(`/api/interviews/${interviewId}/answers`)
    .set("Cookie", cookieA)
    .send({ questionId, responseText: text });
}

function followup(questionId) {
  return request(app)
    .post(`/api/interviews/${interviewId}/followup`)
    .set("Cookie", cookieA)
    .send({ questionId });
}

async function currentQuestionId() {
  const session = await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA);
  return { id: session.body.currentQuestion.id, isFollowUp: session.body.currentQuestion.isFollowUp, phase: session.body.phase };
}

beforeEach(async () => {
  vi.mocked(generateJson).mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  process.env.AI_API_KEY = "test-key";
  process.env.FOLLOWUP_MAX_PER_QUESTION = "2";
  // Question-set generation: always the two-question plan.
  vi.mocked(generateJson).mockImplementation(async ({ prompt }) => {
    if (prompt.includes("Ask exactly")) return PLAN;
    throw new Error("unexpected generateJson call in this test");
  });
  interviewId = await setupInterview();
});

afterEach(() => {
  process.env.AI_API_KEY = "";
  delete process.env.FOLLOWUP_MAX_PER_QUESTION;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("adaptive follow-up decision", () => {
  it("does not generate a follow-up for a clear, complete answer", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "The lifecycle runs mount, update through re-renders when state or props change, and unmount. React re-renders a component when its state changes via the setter, and commits only the changed parts to the DOM.");
    vi.mocked(generateJson).mockImplementationOnce(async () => STRONG_DECISION);

    const res = await followup(q1.id);
    expect(res.status).toBe(200);
    expect(res.body.followUp).toBeNull();
    expect(res.body.note).toBeNull();
    // Session advanced to the next planned question.
    const next = await currentQuestionId();
    expect(next.isFollowUp).toBe(false);
    expect(next.phase).toBe("in_progress");
    expect(await prisma.question.count({ where: { interviewId, isFollowUp: true } })).toBe(0);
  });

  it("generates one follow-up for a vague answer and makes it the current question", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "It just kind of re-renders stuff when needed I think.");
    vi.mocked(generateJson).mockImplementationOnce(async ({ prompt }) => {
      expect(prompt).toContain("<candidate-answer>");
      expect(prompt).toContain("re-renders stuff when needed");
      expect(prompt).toContain("React");
      return FOLLOWUP_DECISION;
    });

    const res = await followup(q1.id);
    expect(res.status).toBe(200);
    expect(res.body.followUp).toMatchObject({ followUpIndex: 1, order: 1 });
    expect(res.body.note).toBeNull();
    expect(res.body.session.currentQuestion.id).toBe(res.body.followUp.id);

    // The follow-up is now the current question, before planned Q2.
    const next = await currentQuestionId();
    expect(next.id).toBe(res.body.followUp.id); // session carries the follow-up
    expect(next.isFollowUp).toBe(true);

    // Persisted correctly: child of the original, sharing its planned order.
    const row = await prisma.question.findUnique({ where: { id: res.body.followUp.id } });
    expect(row).toMatchObject({
      isFollowUp: true,
      followUpIndex: 1,
      parentQuestionId: q1.id,
      questionOrder: 1,
      topic: "React",
    });
  });

  it("stops at the follow-up limit and continues to the next planned question", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "It re-renders somehow, I have not gone deep into it.");

    // Follow-up 1 and 2: both warranted.
    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION);
    const f1 = await followup(q1.id);
    expect(f1.body.followUp.followUpIndex).toBe(1);
    await answer(f1.body.followUp.id, "The reconciler compares element types and keeps instances when the type matches.");
    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION_2);
    const f2 = await followup(f1.body.followUp.id);
    expect(f2.body.followUp.followUpIndex).toBe(2);
    await answer(f2.body.followUp.id, "Unstable keys remount the whole subtree and lose component state each render.");

    // Third follow-up exceeds the limit -> 409, session continues to Q2.
    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION);
    const third = await followup(f2.body.followUp.id);
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe("FOLLOWUP_LIMIT");
    const next = await currentQuestionId();
    expect(next.isFollowUp).toBe(false);
    expect(await prisma.question.count({ where: { interviewId, isFollowUp: true } })).toBe(2);
  });
});

describe("follow-up answers, retries and failures", () => {
  it("saves and evaluates a follow-up answer, then completes", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "Vague one-liner about rendering.");
    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION);
    const f1 = await followup(q1.id);
    const submit = await answer(f1.body.followUp.id, "The reconciler compares the element type; same type reuses the instance and updates props, a different type unmounts and remounts.");
    expect(submit.status).toBe(200);
    expect(submit.body.alreadyRecorded).toBe(false);

    // Complete (all planned + follow-up answered), evaluate, check rows.
    let remaining = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    while (remaining.currentQuestion) {
      await answer(remaining.currentQuestion.id, "A complete planned answer with enough detail.");
      remaining = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    }
    const complete = await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
    expect(complete.status).toBe(200);

    vi.mocked(generateJson).mockImplementation(async () => ({
      score: 70,
      correctness: "PARTIALLY_CORRECT",
      feedback: "Grounded feedback.",
      strengths: ["Specific"],
      improvements: ["Add an example"],
      modelAnswer: "A model answer.",
    }));
    const ev = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(ev.body.failures).toEqual([]);
    expect(ev.body.evaluatedCount).toBe(4); // 3 planned + 1 follow-up, each once

    const rows = await prisma.evaluation.findMany({ include: { answer: true } });
    expect(rows).toHaveLength(4);
  });

  it("is idempotent on retry: no duplicate answers or follow-up questions", async () => {
    const q1 = await currentQuestionId();
    const a1 = await answer(q1.id, "A somewhat thin answer.");
    expect(a1.body.alreadyRecorded).toBe(false);
    const retry = await answer(q1.id, "A somewhat thin answer.");
    expect(retry.body.alreadyRecorded).toBe(true);

    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION);
    const callsBefore = vi.mocked(generateJson).mock.calls.length;
    const first = await followup(q1.id);
    expect(first.body.followUp).not.toBeNull();
    const again = await followup(q1.id); // retried request — frontier returns it, no AI call
    expect(again.status).toBe(200);
    expect(again.body.followUp.id).toBe(first.body.followUp.id);
    expect(vi.mocked(generateJson).mock.calls.length).toBe(callsBefore + 1); // frontier return, no second AI call
    expect(await prisma.question.count({ where: { interviewId, isFollowUp: true } })).toBe(1);
  });

  it("survives a malformed AI decision: answer kept, follow-up skipped", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "An answer that is saved no matter what.");
    vi.mocked(generateJson).mockImplementationOnce(async () => ({ warranted: true })); // no questionText

    const res = await followup(q1.id);
    expect(res.status).toBe(200);
    expect(res.body.followUp).toBeNull();
    expect(res.body.note).toContain("could not prepare a follow-up");
    expect(res.body.session.phase).toBe("in_progress");
    expect(await prisma.question.count({ where: { interviewId, isFollowUp: true } })).toBe(0);

    // The candidate can still answer the next planned question.
    const next = await currentQuestionId();
    const res2 = await answer(next.id, "Continuing with the planned question.");
    expect(res2.status).toBe(200);
  });

  it("survives an AI timeout the same way", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "An answer that is kept.");
    vi.mocked(generateJson).mockImplementationOnce(async () => {
      const err = new Error("request timed out");
      err.name = "APIConnectionTimeoutError";
      throw err;
    });
    const res = await followup(q1.id);
    expect(res.status).toBe(200);
    expect(res.body.followUp).toBeNull();
    expect(res.body.note).toContain("could not prepare a follow-up");
    expect(await prisma.answer.count({ where: { interviewId } })).toBe(1);
  });
});

describe("follow-up authorization and progression", () => {
  it("rejects another user's follow-up request as 404", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "Owner's answer.");
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/followup`)
      .set("Cookie", cookieB)
      .send({ questionId: q1.id });
    expect(res.status).toBe(404);
  });

  it("rejects a follow-up on a question from a different interview", async () => {
    const created = await request(app).post("/api/interviews").set("Cookie", cookieB).send(CONFIG);
    await request(app).post(`/api/interviews/${created.body.interview.id}/start`).set("Cookie", cookieB);
    const foreign = await prisma.question.findFirst({ where: { interviewId: created.body.interview.id } });
    const res = await followup(foreign.id);
    expect(res.status).toBe(404);
  });

  it("rejects a follow-up on an unanswered question and requires auth", async () => {
    const q1 = await currentQuestionId();
    const unanswered = await followup(q1.id);
    expect(unanswered.status).toBe(409);
    expect(unanswered.body.error.code).toBe("FOLLOWUP_NOT_ALLOWED");

    const noAuth = await request(app)
      .post(`/api/interviews/${interviewId}/followup`)
      .send({ questionId: q1.id });
    expect(noAuth.status).toBe(401);
  });

  it("refuses follow-ups on completed interviews", async () => {
    // Answer everything (no follow-ups warranted) and complete.
    let view = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    vi.mocked(generateJson).mockImplementation(async () => STRONG_DECISION);
    while (view.currentQuestion) {
      await answer(view.currentQuestion.id, "Complete, specific, honest answer with detail.");
      view = (await followup(view.currentQuestion.id)).body.session;
    }
    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
    const answeredQuestion = await prisma.question.findFirst({ where: { interviewId } });
    const res = await followup(answeredQuestion.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_COMPLETED");
  });
});

describe("reports and analytics with follow-ups", () => {
  it("shows follow-ups in the report after their parent, without double-counting", async () => {
    const q1 = await currentQuestionId();
    await answer(q1.id, "A thin first answer.");
    vi.mocked(generateJson).mockImplementationOnce(async () => FOLLOWUP_DECISION);
    const f1 = await followup(q1.id);
    await answer(f1.body.followUp.id, "A deeper follow-up answer with detail.");
    // Answer every remaining planned question, then complete.
    let rest = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    while (rest.currentQuestion) {
      await answer(rest.currentQuestion.id, "The planned answer, complete and specific.");
      rest = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    }
    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);

    vi.mocked(generateJson).mockImplementation(async () => ({
      score: 60,
      correctness: "PARTIALLY_CORRECT",
      feedback: "Feedback.",
      strengths: ["One"],
      improvements: ["One"],
      modelAnswer: "Model.",
    }));
    const ev = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(ev.body.evaluatedCount).toBe(4);

    const results = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieA);
    const items = results.body.items;
    // Order: planned Q1, its follow-up, planned Q2, planned Q3 — follow-up
    // directly after its parent.
    expect(items.map((i) => ({ o: i.question.order, f: i.question.isFollowUp }))).toEqual([
      { o: 1, f: false },
      { o: 1, f: true },
      { o: 2, f: false },
      { o: 3, f: false },
    ]);
    expect(items[1].question.followUpIndex).toBe(1);
    // Every answer evaluated once; the overall mean covers all four answers.
    expect(results.body.totalAnswered).toBe(4);
    expect(results.body.evaluatedCount).toBe(4);
    expect(results.body.avgScore).toBe(60);
    // Analytics: one topic (React), four answers counted once each.
    const stats = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    expect(stats.body.topics).toEqual([
      expect.objectContaining({ topic: "React", answered: 4, avgScore: 60 }),
    ]);
  });
});
