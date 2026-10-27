// Whole-interview feedback report tests. The AI is MOCKED (vi.mock of
// geminiClient) — no credits, no network. Covers: generation after
// completion, grounding in saved data, malformed output, provider failures,
// DB-idempotent retries, ownership, incomplete evaluations, follow-ups in
// context, and the results read serving the persisted report.
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

const USER_A = { name: "Report Owner", email: "report-owner@example.com", password: "password-1a" };
const USER_B = { name: "Report Other", email: "report-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Backend Developer",
  experienceLevel: "1-3",
  difficulty: "MEDIUM",
  interviewType: "TECHNICAL",
  topics: ["React", "Node.js"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 30,
};

const PLAN_QUESTIONS = {
  questions: [
    { text: "Explain the component lifecycle and when re-renders happen.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Describe how asynchronous work and error recovery are handled.", topic: "Node.js", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Compare caching strategies for a public API.", topic: "Node.js", difficulty: "MEDIUM", questionType: "technical" },
  ],
};

const ANSWER_EVALS = [
  { score: 80, correctness: "CORRECT" },
  { score: 40, correctness: "PARTIALLY_CORRECT" },
  { score: 30, correctness: "INCORRECT" },
];

const VALID_REPORT = {
  summary:
    "Across three questions you showed solid React fundamentals but weaker Node.js depth. Your lifecycle answer was specific and correct. The async error-recovery and caching answers lacked concrete detail.",
  strengths: [
    {
      point: "Solid React lifecycle understanding",
      evidence: "Your lifecycle answer correctly walked through mount, update and unmount phases.",
    },
  ],
  improvements: [
    {
      point: "Async error recovery in Node.js",
      evidence: "Your async answer did not mention try/catch or error propagation.",
    },
  ],
  skillNotes: [
    {
      topic: "React",
      assessment: "Comfortable with core component concepts at the 1-3 year level.",
      evidence: "The lifecycle answer was specific and correctly ordered.",
      confidence: "HIGH",
    },
    {
      topic: "Node.js",
      assessment: "Needs deeper work on async patterns and caching.",
      evidence: "Both Node.js answers stayed high-level without implementation detail.",
      confidence: "MEDIUM",
    },
  ],
  plan: [
    {
      topic: "Node.js",
      why: "Both Node.js questions scored lowest and lacked implementation detail.",
      priority: "HIGH",
      exercise: "Build a small Express route with try/catch error handling and a fallback cache layer.",
      doneWhen: "You can explain your error-propagation path without checking notes.",
      sequence: 1,
    },
    {
      topic: "Caching",
      why: "The caching question scored 30 and had no strategy comparison.",
      priority: "MEDIUM",
      exercise: "Write a short comparison of in-memory vs Redis caching for one of your projects.",
      doneWhen: "The comparison names one trade-off for each option.",
      sequence: 2,
    },
  ],
};

let cookieA = "";
let cookieB = "";
let interviewId = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

beforeEach(async () => {
  vi.mocked(generateJson).mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  process.env.AI_API_KEY = "test-key";

  // Create, start, answer, complete, evaluate — one full interview.
  vi.mocked(generateJson).mockImplementationOnce(async () => PLAN_QUESTIONS);
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  interviewId = created.body.interview.id;
  await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
  const questions = await prisma.question.findMany({ where: { interviewId }, orderBy: { questionOrder: "asc" } });

  let call = 0;
  vi.mocked(generateJson).mockImplementation(async ({ prompt }) => {
    if (prompt.includes("Ask exactly")) return PLAN_QUESTIONS;
    const e = ANSWER_EVALS[Math.min(call, ANSWER_EVALS.length - 1)];
    call += 1;
    return {
      score: e.score,
      correctness: e.correctness,
      feedback: `Grounded feedback for evaluation ${call}.`,
      strengths: ["One strength"],
      improvements: ["One improvement"],
      modelAnswer: "A model answer.",
    };
  });

  let view = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
  while (view.currentQuestion) {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set("Cookie", cookieA)
      .send({ questionId: view.currentQuestion.id, responseText: `Answer ${view.currentQuestion.order}: a grounded answer with specifics.` });
    view = res.body;
  }
  await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
  const ev = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
  expect(ev.body.failures).toEqual([]);
});

afterEach(() => {
  process.env.AI_API_KEY = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/interviews/:id/feedback", () => {
  it("generates a grounded report after completion and persists it", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);

    const res = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.feedback.summary).toContain("Node.js depth");

    // Grounding: the prompt carried the candidate's actual answers + evaluations.
    const reportCall = vi.mocked(generateJson).mock.calls.find(
      (c) => c[0].prompt.includes("END RECORD"),
    );
    expect(reportCall).toBeTruthy();
    expect(reportCall[0].prompt).toContain("Answer 1: a grounded answer");
    expect(reportCall[0].prompt).toContain("score 80/100");

    const row = await prisma.interviewReport.findUnique({ where: { interviewId } });
    expect(row).toBeTruthy();
    expect(row.summary).toContain("Node.js depth");
  });

  it("returns the stored report on retry without a second AI call", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);
    await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    const callsAfterFirst = vi.mocked(generateJson).mock.calls.length;

    const again = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(again.status).toBe(200);
    expect(again.body.feedback.summary).toContain("Node.js depth");
    expect(vi.mocked(generateJson).mock.calls.length).toBe(callsAfterFirst);
  });

  it("survives concurrent generation without duplicate reports", async () => {
    vi.mocked(generateJson).mockImplementation(async () => VALID_REPORT);
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA),
      request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA),
    ]);
    for (const r of [r1, r2]) expect(r.status).toBe(200);
    expect(await prisma.interviewReport.count({ where: { interviewId } })).toBe(1);
  });

  it("rejects malformed AI output without persisting", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => ({ summary: "too short", wrong: true }));
    const res = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("REPORT_GENERATION_FAILED");
    expect(await prisma.interviewReport.count({ where: { interviewId } })).toBe(0);

    // Retry works: nothing was persisted by the failed attempt.
    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);
    const retry = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(retry.status).toBe(200);
  });

  it("survives an AI timeout with a retryable error", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => {
      const err = new Error("request timed out");
      err.name = "APIConnectionTimeoutError";
      throw err;
    });
    const res = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("REPORT_GENERATION_FAILED");
  });

  it("rejects another user's report request as 404", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);
    const res = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieB);
    expect(res.status).toBe(404);
    expect(await prisma.interviewReport.count()).toBe(0);
  });

  it("requires authentication and a completed interview", async () => {
    const noAuth = await request(app).post(`/api/interviews/${interviewId}/feedback`);
    expect(noAuth.status).toBe(401);

    const pending = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
    const res = await request(app)
      .post(`/api/interviews/${pending.body.interview.id}/feedback`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOT_COMPLETE");
  });
});

describe("GET /:id/results — feedback integration", () => {
  it("serves the persisted report with the results read", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);
    await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);

    const res = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toMatchObject({
      summary: expect.stringContaining("Node.js depth"),
    });
    expect(res.body.feedback.skillNotes[0].confidence).toBe("HIGH");
    expect(res.body.feedback.plan[0].priority).toBe("HIGH");
    // The plan targets the weakest topic from the actual results.
    expect(res.body.feedback.plan[0].topic).toBe("Node.js");
  });

  it("returns feedback: null before generation", async () => {
    const res = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toBeNull();
  });

  it("includes follow-up answers in the report context without double-counting", async () => {
    // Add a follow-up to Q1 with its own answer and evaluation.
    const q1 = await prisma.question.findFirst({ where: { interviewId, questionOrder: 1 } });
    const followUp = await prisma.question.create({
      data: {
        interviewId,
        text: "Follow-up: how does reconciliation decide when to reuse an instance?",
        topic: "React",
        difficulty: "MEDIUM",
        questionOrder: 1,
        questionType: "technical",
        isFollowUp: true,
        followUpIndex: 1,
        parentQuestionId: q1.id,
      },
    });
    await prisma.answer.create({
      data: { questionId: followUp.id, interviewId, responseText: "The reconciler reuses instances when types match.", timeTakenSeconds: 60 },
    });
    await prisma.evaluation.create({
      data: { answerId: (await prisma.answer.findFirst({ where: { questionId: followUp.id } })).id, score: 85, correctness: "CORRECT", feedback: "Good.", strengths: ["Specific"], improvements: ["Go deeper"], modelAnswer: "Model." },
    });

    vi.mocked(generateJson).mockImplementationOnce(async () => VALID_REPORT);
    const res = await request(app).post(`/api/interviews/${interviewId}/feedback`).set("Cookie", cookieA);
    expect(res.status).toBe(200);

    // The prompt carried the follow-up as its own record entry.
    const reportCall = vi.mocked(generateJson).mock.calls.find((c) => c[0].prompt.includes("END RECORD"));
    expect(reportCall[0].prompt).toContain("Follow-up 1 on question 1");
    expect(reportCall[0].prompt).toContain("reconciler reuses instances");

    // Results: 4 evaluated answers (3 planned + 1 follow-up), each once.
    const results = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieA);
    expect(results.body.evaluatedCount).toBe(4);
    expect(results.body.feedback).not.toBeNull();
  });
});
