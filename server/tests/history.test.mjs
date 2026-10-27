// Phase 4.5: history filters, retakes, comparison, progress tracking.
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

const USER_A = { name: "History Owner", email: "history-owner@example.com", password: "password-1a" };
const USER_B = { name: "History Other", email: "history-other@example.com", password: "password-1b" };

const CONFIG_A = {
  roleTitle: "Frontend Developer",
  experienceLevel: "1-3",
  difficulty: "MEDIUM",
  interviewType: "TECHNICAL",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 30,
};

const PLAN_A = {
  questions: [
    { text: "Explain the component lifecycle and when re-renders happen.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Describe how state updates propagate through the tree.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
    { text: "Compare two approaches to fetching data in effects.", topic: "React", difficulty: "MEDIUM", questionType: "technical" },
  ],
};

let cookieA = "";
let cookieB = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

// Runs one interview to completion with per-question scores from scores[].
// The scores array length MUST equal config.questionCount. Returns the id.
async function runInterview(config, scores) {
  const variety = [
    "Explain the core concepts and when they apply.",
    "Walk through a practical implementation with a concrete example.",
    "Compare two approaches and the trade-offs between them.",
  ];
  vi.mocked(generateJson).mockImplementationOnce(async () => ({
    questions: scores.map((s, i) => ({
      text: variety[i % variety.length] + " Attempt " + (i + 1) + " on " + config.topics[0] + ".",
      topic: config.topics[0],
      difficulty: config.difficulty,
      questionType: "technical",
    })),
  }));
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(config);
  const id = created.body.interview.id;
  await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookieA);

  let evalCall = 0;
  vi.mocked(generateJson).mockImplementation(async () => {
    const e = scores[Math.min(evalCall, scores.length - 1)];
    evalCall += 1;
    return {
      score: e,
      correctness: e >= 70 ? "CORRECT" : e >= 45 ? "PARTIALLY_CORRECT" : "INCORRECT",
      feedback: `Grounded feedback ${evalCall}.`,
      strengths: ["One"],
      improvements: ["One"],
      modelAnswer: "Model.",
    };
  });

  let view = (await request(app).get(`/api/interviews/${id}/session`).set("Cookie", cookieA)).body;
  while (view.currentQuestion) {
    const res = await request(app)
      .post(`/api/interviews/${id}/answers`)
      .set("Cookie", cookieA)
      .send({ questionId: view.currentQuestion.id, responseText: "A grounded answer with detail." });
    view = res.body;
  }
  const completeRes = await request(app).post(`/api/interviews/${id}/complete`).set("Cookie", cookieA);
  if (completeRes.status !== 200) {
    throw new Error("runInterview complete failed: " + completeRes.status);
  }
  const evaluateRes = await request(app).post(`/api/interviews/${id}/evaluate`).set("Cookie", cookieA);
  if ((evaluateRes.body.evaluatedCount ?? 0) !== scores.length) {
    throw new Error("runInterview evaluate failed");
  }
  return id;
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

describe("GET /api/interviews — history filters", () => {
  beforeEach(async () => {
    await runInterview(CONFIG_A, [70, 70, 70]); // completed
    await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG_A); // draft
  });

  it("filters by status", async () => {
    const completed = await request(app).get("/api/interviews?status=COMPLETED").set("Cookie", cookieA);
    expect(completed.body.interviews.every((i) => i.status === "COMPLETED")).toBe(true);
    expect(completed.body.total).toBe(1);

    const drafts = await request(app).get("/api/interviews?status=PENDING").set("Cookie", cookieA);
    expect(drafts.body.total).toBe(1);
  });

  it("filters by role substring, case-insensitively", async () => {
    const res = await request(app).get("/api/interviews?role=frontend").set("Cookie", cookieA);
    expect(res.body.total).toBe(2);
    expect(res.body.interviews.every((i) => /frontend/i.test(i.roleTitle))).toBe(true);

    const none = await request(app).get("/api/interviews?role=DevOps").set("Cookie", cookieA);
    expect(none.body.total).toBe(0);
  });

  it("filters by date range", async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await request(app).get(`/api/interviews?from=${tomorrow}`).set("Cookie", cookieA);
    expect(res.body.total).toBe(0);

    const all = await request(app)
      .get(`/api/interviews?from=${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}`)
      .set("Cookie", cookieA);
    expect(all.body.total).toBe(2);
  });

  it("combines filters and stays scoped to the session user", async () => {
    await request(app).post("/api/interviews").set("Cookie", cookieB).send(CONFIG_A);
    const res = await request(app).get("/api/interviews?status=PENDING&role=frontend").set("Cookie", cookieA);
    expect(res.body.total).toBe(1); // only user A's draft
  });

  it("rejects invalid filter values", async () => {
    const res = await request(app).get("/api/interviews?status=ABANDONED").set("Cookie", cookieA);
    expect(res.status).toBe(422);
  });
});

describe("POST /api/interviews/:id/retake", () => {
  let completedId = "";

  beforeEach(async () => {
    completedId = await runInterview(CONFIG_A, [70, 70, 70]);
  });

  it("creates a fresh attempt from the saved configuration", async () => {
    const res = await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieA);
    expect(res.status).toBe(201);
    expect(res.body.interview.id).not.toBe(completedId);
    expect(res.body.interview.status).toBe("PENDING");
    expect(res.body.interview).toMatchObject({
      roleTitle: CONFIG_A.roleTitle,
      experienceLevel: CONFIG_A.experienceLevel,
      interviewType: CONFIG_A.interviewType,
      difficulty: CONFIG_A.difficulty,
      topics: CONFIG_A.topics,
      mode: CONFIG_A.mode,
      questionCount: CONFIG_A.questionCount,
      durationMinutes: CONFIG_A.durationMinutes,
    });
    expect(await prisma.question.count({ where: { interviewId: res.body.interview.id } })).toBe(0);
    expect(await prisma.answer.count({ where: { interviewId: res.body.interview.id } })).toBe(0);
  });

  it("never modifies the previous attempt", async () => {
    const answersBefore = await prisma.answer.count({ where: { interviewId: completedId } });
    const evalsBefore = await prisma.evaluation.count({ where: { answer: { interviewId: completedId } } });

    await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieA);

    expect(await prisma.answer.count({ where: { interviewId: completedId } })).toBe(answersBefore);
    expect(await prisma.evaluation.count({ where: { answer: { interviewId: completedId } } })).toBe(evalsBefore);
    const sourceRow = await prisma.interview.findUnique({ where: { id: completedId } });
    expect(sourceRow.status).toBe("COMPLETED"); // untouched state
  });

  it("returns the same fresh attempt on rapid retries (dedupe window)", async () => {
    const r1 = await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieA);
    const r2 = await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieA);
    expect(r1.body.interview.id).toBe(r2.body.interview.id);
  });

  it("rejects other users and unauthenticated requests", async () => {
    const asB = await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieB);
    expect(asB.status).toBe(404);
    const noAuth = await request(app).post(`/api/interviews/${completedId}/retake`);
    expect(noAuth.status).toBe(401);
  });

  it("keeps the previous attempt's evaluations on the old attempt only", async () => {
    const evalsBefore = await prisma.evaluation.count({ where: { answer: { interviewId: completedId } } });
    const retake = await request(app).post(`/api/interviews/${completedId}/retake`).set("Cookie", cookieA);
    expect(retake.status).toBe(201);
    expect(await prisma.evaluation.count({ where: { answer: { interviewId: completedId } } })).toBe(evalsBefore);
    expect(await prisma.evaluation.count({ where: { answer: { interviewId: retake.body.interview.id } } })).toBe(0);
  });
});

describe("GET /api/interviews/:id/compare", () => {
  it("compares two completed attempts of the same role with honest deltas", async () => {
    const id1 = await runInterview({ ...CONFIG_A, roleTitle: "React Developer" }, [30, 30, 30]);
    const id2 = await runInterview({ ...CONFIG_A, roleTitle: "React Developer" }, [80, 80, 80]);

    const res = await request(app).get(`/api/interviews/${id1}/compare?with=${id2}`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.a.id).toBe(id1);
    expect(res.body.b.id).toBe(id2);
    expect(res.body.a.avgScore).toBe(30);
    expect(res.body.b.avgScore).toBe(80);
    expect(res.body.comparability).toMatchObject({
      sameRole: true,
      sameType: true,
      sameDifficulty: true,
      comparable: true,
    });
    expect(res.body.comparability.sharedTopics).toEqual(["React"]);
    expect(res.body.a.topicScores[0].topic).toBe("React");
    expect(res.body.b.topicScores[0].topic).toBe("React");
  });

  it("flags incomparable attempts honestly", async () => {
    const id1 = await runInterview({ ...CONFIG_A, roleTitle: "React Developer", difficulty: "EASY" }, [70, 70, 70]);
    const id2 = await runInterview(
      { ...CONFIG_A, roleTitle: "Backend Developer", difficulty: "HARD", topics: ["Node.js"] },
      [70, 70, 70],
    );

    const res = await request(app).get(`/api/interviews/${id1}/compare?with=${id2}`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.comparability).toMatchObject({
      sameRole: false,
      sameDifficulty: false,
      comparable: false,
    });
    expect(res.body.comparability.differingTopics.onlyInSecond).toContain("Node.js");
  });

  it("rejects cross-user comparisons as 404 and the same interview as 422", async () => {
    const ownId = await runInterview({ ...CONFIG_A, roleTitle: "React Developer" }, [70, 70, 70]);
    // B's completed attempt
    vi.mocked(generateJson).mockImplementationOnce(async () => PLAN_A);
    const created = await request(app).post("/api/interviews").set("Cookie", cookieB).send(CONFIG_A);
    const bId = created.body.interview.id;
    await request(app).post(`/api/interviews/${bId}/start`).set("Cookie", cookieB);
    let view = (await request(app).get(`/api/interviews/${bId}/session`).set("Cookie", cookieB)).body;
    vi.mocked(generateJson).mockImplementation(async () => ({
      score: 50,
      correctness: "PARTIALLY_CORRECT",
      feedback: "Feedback.",
      strengths: ["One"],
      improvements: ["One"],
      modelAnswer: "Model.",
    }));
    while (view.currentQuestion) {
      await request(app)
        .post(`/api/interviews/${bId}/answers`)
        .set("Cookie", cookieB)
        .send({ questionId: view.currentQuestion.id, responseText: "B's answer." });
      view = (await request(app).get(`/api/interviews/${bId}/session`).set("Cookie", cookieB)).body;
    }
    await request(app).post(`/api/interviews/${bId}/complete`).set("Cookie", cookieB);

    // A's own completed attempt vs B's completed attempt: cross-user -> 404
    const crossUser = await request(app).get(`/api/interviews/${ownId}/compare?with=${bId}`).set("Cookie", cookieA);
    expect(crossUser.status).toBe(404);

    const same = await request(app).get(`/api/interviews/${bId}/compare?with=${bId}`).set("Cookie", cookieB);
    expect(same.status).toBe(422);
  });

  it("handles attempts with missing evaluations honestly", async () => {
    const id1 = await runInterview({ ...CONFIG_A, roleTitle: "React Developer" }, [70, 70, 70]);
    // Second attempt: completed but never evaluated.
    vi.mocked(generateJson).mockImplementationOnce(async () => PLAN_A);
    const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG_A);
    const id2 = created.body.interview.id;
    await request(app).post(`/api/interviews/${id2}/start`).set("Cookie", cookieA);
    let view = (await request(app).get(`/api/interviews/${id2}/session`).set("Cookie", cookieA)).body;
    while (view.currentQuestion) {
      await request(app)
        .post(`/api/interviews/${id2}/answers`)
        .set("Cookie", cookieA)
        .send({ questionId: view.currentQuestion.id, responseText: "An answer without evaluation." });
      view = (await request(app).get(`/api/interviews/${id2}/session`).set("Cookie", cookieA)).body;
    }
    await request(app).post(`/api/interviews/${id2}/complete`).set("Cookie", cookieA);

    const res = await request(app).get(`/api/interviews/${id1}/compare?with=${id2}`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.a.avgScore).toBe(70);
    expect(res.body.b.avgScore).toBeNull();
    expect(res.body.b.evaluatedCount).toBe(0);
  });
});

describe("analytics progress tracking", () => {
  it("reports topic trends and recurring weak skills across attempts", async () => {
    // Two React-only attempts: weak first, strong second. Backdate the first
    // attempt so completedAt ordering is unambiguous for the trend.
    const firstId = await runInterview({ ...CONFIG_A }, [40, 40, 40]);
    await prisma.interview.update({
      where: { id: firstId },
      data: { completedAt: new Date(Date.now() - 3600 * 1000) },
    });
    await runInterview({ ...CONFIG_A }, [80, 80, 80]);

    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    const reactTrend = res.body.topicTrends.find((t) => t.topic === "React");
    expect(reactTrend).toMatchObject({ firstAvg: 40, latestAvg: 80, delta: 40, direction: "IMPROVED", interviews: 2 });
    // React IS flagged: the documented recurringWeak rule uses the aggregate
    // mean across ALL evaluated answers ((40*3 + 80*3) / 6 = 60 < 70), not the
    // latest attempt alone. Improvement alone does not clear the flag.
    expect(res.body.recurringWeak).toEqual(["React"]);
  });

  it("flags recurring weak skills", async () => {
    await runInterview({ ...CONFIG_A, topics: ["Node.js"], questionCount: 3 }, [30, 30, 30]);
    await runInterview({ ...CONFIG_A, topics: ["Node.js"], questionCount: 3 }, [35, 35, 35]);

    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    expect(res.body.recurringWeak).toContain("Node.js");
    expect(res.body.nextFocus).toMatchObject({ topic: "Node.js" });
  });

  it("excludes single-interview topics from trend claims", async () => {
    await runInterview(CONFIG_A, [20, 20, 20]);
    const res = await request(app).get("/api/interviews/analytics").set("Cookie", cookieA);
    // One scored interview: topic appears but no trend direction is claimed.
    expect(res.body.topicTrends.find((t) => t.topic === "React")).toBeUndefined();
    expect(res.body.trend.length).toBe(1); // listed, not trended
  });
});
