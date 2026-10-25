// Phase 2.5 hardening tests: concurrency races, malformed AI output,
// per-question timing, and failure-report hygiene. Providers mocked.
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

const USER_A = { name: "Hardening Owner", email: "hard-owner@example.com", password: "password-1a" };
const USER_B = { name: "Hardening Other", email: "hard-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Hardening Run",
  experienceLevel: "0-1",
  difficulty: "EASY",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 20,
};

const AI_QUESTIONS = {
  questions: Array.from({ length: 3 }, (_, i) => ({
    text: `Hardening question ${i + 1} about React concepts.`,
    topic: "React",
    difficulty: "EASY",
    questionType: "technical",
  })),
};

const AI_EVAL = {
  score: 71,
  correctness: "PARTIALLY_CORRECT",
  feedback: "Covers the core idea with one example.",
  strengths: ["Core idea present"],
  improvements: ["Add a trade-off"],
  modelAnswer: "Define the concept, explain why, give one example.",
};

let cookieA = "";
let cookieB = "";
let interviewId = "";
let questions = [];

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

async function setup() {
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  interviewId = created.body.interview.id;
  await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
  const rows = await prisma.question.findMany({ where: { interviewId }, orderBy: { questionOrder: "asc" } });
  questions = rows;
}

async function submit(qid, text = "A reasonable answer with an example.") {
  return request(app)
    .post(`/api/interviews/${interviewId}/answers`)
    .set("Cookie", cookieA)
    .send({ questionId: qid, responseText: text });
}

beforeEach(async () => {
  vi.mocked(generateJson).mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  process.env.AI_API_KEY = "test-key";
  vi.mocked(generateJson).mockResolvedValueOnce(AI_QUESTIONS);
  await setup();
});

afterEach(() => {
  process.env.AI_API_KEY = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("concurrent duplicate answer submission", () => {
  it("keeps exactly one row and both requests succeed", async () => {
    const q1 = questions[0];
    const [r1, r2] = await Promise.all([submit(q1.id, "First request text."), submit(q1.id, "Second request text.")]);

    expect([r1.status, r2.status].sort()).toEqual([200, 200]);
    expect([r1.body.alreadyRecorded, r2.body.alreadyRecorded].sort()).toEqual([false, true]);

    const rows = await prisma.answer.findMany({ where: { interviewId } });
    expect(rows).toHaveLength(1);
    expect(["First request text.", "Second request text."]).toContain(rows[0].responseText);
  });
});

describe("per-question timing", () => {
  it("does not inherit earlier questions' answering time", async () => {
    // Space two submissions apart; the second's timeTaken must be based on
    // the first answer's submission, not the interview start.
    await submit(questions[0].id);
    await new Promise((r) => setTimeout(r, 1200));
    await submit(questions[1].id);

    const answers = await prisma.answer.findMany({
      where: { interviewId },
      orderBy: { submittedAt: "asc" },
      include: { question: { select: { questionOrder: true } } },
    });
    const second = answers.find((a) => a.question.questionOrder === 2);
    expect(second.timeTakenSeconds).toBeLessThan(60); // not interview-total (~minutes in CI is fine, but creation-to-now for q1 was instant)
    expect(second.timeTakenSeconds).toBeGreaterThanOrEqual(1);
  }, 15000);
});

describe("evaluation hardening", () => {
  async function answerAll() {
    for (const q of questions) {
      await submit(q.id);
    }
    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
  }

  it("tolerates concurrent evaluate runs without failures or duplicates", async () => {
    vi.mocked(generateJson).mockImplementation(async () => AI_EVAL);
    await answerAll();

    const [e1, e2] = await Promise.all([
      request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA),
      request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA),
    ]);

    expect(e1.status).toBe(200);
    expect(e2.status).toBe(200);
    expect(e1.body.failures).toEqual([]);
    expect(e2.body.failures).toEqual([]);
    expect(await prisma.evaluation.count({ where: { answer: { interviewId } } })).toBe(3);
  });

  it("rejects a malformed evaluation payload without storing anything", async () => {
    vi.mocked(generateJson).mockResolvedValue({ score: 999, feedback: "bad", wrong: true });
    await answerAll();

    const res = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.failures).toHaveLength(3);
    expect(res.body.evaluatedCount).toBe(0);
    expect(await prisma.evaluation.count()).toBe(0);
    // Reported message is ours, not a zod/Prisma dump.
    expect(JSON.stringify(res.body.failures)).not.toContain("Validation");
    expect(JSON.stringify(res.body.failures)).not.toContain("Received");
  });

  it("reports unexpected internal errors generically, without leaking internals", async () => {
    const boom = new Error("Unique constraint failed on the fields: (`answer_id`) — raw prisma text");
    vi.mocked(generateJson).mockRejectedValue(boom);
    await answerAll();

    const res = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.failures).toHaveLength(3);
    for (const f of res.body.failures) {
      expect(f.code).toBe("INTERNAL");
      expect(f.message).not.toContain("prisma");
      expect(f.message).not.toContain("Unique constraint");
    }
  });

  it("retry after failure evaluates only the missing answers", async () => {
    let call = 0;
    vi.mocked(generateJson).mockImplementation(async () => {
      call++;
      if (call <= 2) throw new Error("provider hiccup");
      return AI_EVAL;
    });
    await answerAll();

    const first = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(first.body.evaluatedCount).toBe(1); // one worker succeeded on its 3rd call
    expect(first.body.failures.length).toBe(2);

    const second = await request(app).post(`/api/interviews/${interviewId}/evaluate`).set("Cookie", cookieA);
    expect(second.body.evaluatedCount).toBe(3);
    expect(second.body.failures).toEqual([]);
    expect(await prisma.evaluation.count()).toBe(3);
  });

  it("keeps a saved answer when evaluation fails, and survives refresh reads", async () => {
    vi.mocked(generateJson).mockRejectedValue(new Error("eval down"));
    await answerAll();

    const results = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieA);
    expect(results.status).toBe(200);
    expect(results.body.totalAnswered).toBe(3);
    expect(results.body.evaluatedCount).toBe(0);
    // Ownership still enforced on results.
    const asB = await request(app).get(`/api/interviews/${interviewId}/results`).set("Cookie", cookieB);
    expect(asB.status).toBe(404);
  });
});
