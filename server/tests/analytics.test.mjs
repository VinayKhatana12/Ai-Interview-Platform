// Analytics endpoint tests: honest aggregates over persisted evaluations,
// partial-result flags, empty state, and cross-user isolation. Providers
// mocked like ai.test.mjs.
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

const USER_A = { name: "Analytics Owner", email: "analytics-owner@example.com", password: "password-1a" };
const USER_B = { name: "Analytics Other", email: "analytics-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Analytics Run",
  experienceLevel: "1-3",
  difficulty: "MEDIUM",
  topics: ["React", "OOP"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 20,
};

const AI_QUESTIONS = {
  questions: Array.from({ length: 3 }, (_, i) => ({
    text: `Analytics question ${i + 1}.`,
    topic: i === 0 ? "OOP" : "React",
    difficulty: "MEDIUM",
    questionType: "technical",
  })),
};

const EVAL = (score, correctness = "PARTIALLY_CORRECT") => ({
  score,
  correctness,
  feedback: "Grounded feedback text.",
  strengths: ["One strength"],
  improvements: ["One improvement"],
  modelAnswer: "A model answer.",
});

let cookieA = "";
let cookieB = "";

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
});

afterEach(() => {
  process.env.AI_API_KEY = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/interviews/analytics", () => {
  it("reports an honest empty state", async () => {
    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      completedCount: 0,
      scoredCount: 0,
      answeredTotal: 0,
      avgScore: null,
      bestScore: null,
      trend: [],
      topics: [],
      strongest: null,
      weakest: null,
    });
  });

  it("aggregates topic averages, verdicts and a chronological trend", async () => {
    // Interview 1: Q1 OOP=50, Q2 React=80, Q3 React=70.
    vi.mocked(generateJson).mockImplementationOnce(async () => AI_QUESTIONS);
    const c1 = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
    const id1 = c1.body.interview.id;
    await request(app).post(`/api/interviews/${id1}/start`).set("Cookie", cookieA);
    const qs1 = await prisma.question.findMany({ where: { interviewId: id1 }, orderBy: { questionOrder: "asc" } });
    const scoreByQid = new Map([
      [qs1[0].id, [EVAL(50, "PARTIALLY_CORRECT")]],
      [qs1[1].id, [EVAL(80, "CORRECT")]],
      [qs1[2].id, [EVAL(70, "CORRECT")]],
    ]);
    // Evaluate directly (bypassing the mock-order problem): insert evaluations
    // via the evaluate endpoint would need per-answer mocks; instead call the
    // evaluate endpoint with a queue-based mock.
    const queue = [EVAL(50, "PARTIALLY_CORRECT"), EVAL(80, "CORRECT"), EVAL(70, "CORRECT")];
    vi.mocked(generateJson).mockImplementation(async () => queue.shift() ?? EVAL(0));
    let view = (await request(app).get(`/api/interviews/${id1}/session`).set("Cookie", cookieA)).body;
    while (view.currentQuestion) {
      view = await request(app)
        .post(`/api/interviews/${id1}/answers`)
        .set("Cookie", cookieA)
        .send({ questionId: view.currentQuestion.id, responseText: "Grounded." })
        .then((r) => r.body);
    }
    await request(app).post(`/api/interviews/${id1}/complete`).set("Cookie", cookieA);
    const ev1 = await request(app).post(`/api/interviews/${id1}/evaluate`).set("Cookie", cookieA);
    expect(ev1.body.failures).toEqual([]);

    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    const a = res.body;

    expect(a.completedCount).toBe(1);
    expect(a.scoredCount).toBe(1);
    expect(a.answeredTotal).toBe(3);
    expect(a.avgScore).toBe(66.7); // (50+80+70)/3
    expect(a.bestScore).toBe(66.7);
    expect(a.trend).toHaveLength(1);
    expect(a.trend[0]).toMatchObject({ id: id1, score: 66.7, partial: false });
    expect(a.verdicts).toEqual({ CORRECT: 2, PARTIALLY_CORRECT: 1, INCORRECT: 0 });

    // Topic aggregation: React has two answers (80, 70 -> 75), OOP one (50).
    const react = a.topics.find((t) => t.topic === "React");
    const oop = a.topics.find((t) => t.topic === "OOP");
    expect(react).toMatchObject({ answered: 2, avgScore: 75, correct: 2, partial: 0, incorrect: 0 });
    expect(oop).toMatchObject({ answered: 1, avgScore: 50, correct: 0, partial: 1, incorrect: 0 });

    // Strongest/weakest need TWO topics with data — here both exist.
    expect(a.strongest).toBe("React");
    expect(a.weakest).toBe("OOP");

    // Ownership: the other candidate sees nothing.
    const asB = await request(app).get("/api/interviews/analytics").set("Cookie", cookieB);
    expect(asB.body.completedCount).toBe(0);
    expect(asB.body.topics).toEqual([]);
  });

  it("flags a partially evaluated interview in the trend", async () => {
    vi.mocked(generateJson).mockImplementationOnce(async () => AI_QUESTIONS);
    const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
    const id = created.body.interview.id;
    await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookieA);
    const qs = await prisma.question.findMany({ where: { interviewId: id }, orderBy: { questionOrder: "asc" } });

    vi.mocked(generateJson).mockImplementation(async () => EVAL(64, "PARTIALLY_CORRECT"));
    // Answer only the first question, then force-complete via backdating.
    let view = (await request(app).get(`/api/interviews/${id}/session`).set("Cookie", cookieA)).body;
    await request(app)
      .post(`/api/interviews/${id}/answers`)
      .set("Cookie", cookieA)
      .send({ questionId: view.currentQuestion.id, responseText: "One answer." });
    const interview = await prisma.interview.findUnique({ where: { id } });
    await prisma.interview.update({
      where: { id },
      data: { startedAt: new Date(interview.startedAt.getTime() - 25 * 60000) },
    });
    await request(app).post(`/api/interviews/${id}/complete`).set("Cookie", cookieA);
    const ev = await request(app).post(`/api/interviews/${id}/evaluate`).set("Cookie", cookieA);
    expect(ev.body.evaluatedCount).toBe(1);

    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    expect(res.body.trend).toHaveLength(1);
    expect(res.body.trend[0].partial).toBe(true);
    expect(res.body.trend[0].score).toBe(64);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/interviews/analytics");
    expect(res.status).toBe(401);
  });
});
