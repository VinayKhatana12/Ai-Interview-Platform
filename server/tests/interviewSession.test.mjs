// Interview session engine: start, resume, submit, idempotency, ordering,
// time limits, completion, and ownership. Runs against ai_interview_test.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const USER_A = { name: "Session Owner", email: "session-owner@example.com", password: "password-1a" };
const USER_B = { name: "Session Other", email: "session-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Full Stack Developer",
  experienceLevel: "0-1",
  difficulty: "MEDIUM",
  topics: ["React", "Node.js"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 30,
};

let cookieA = "";
let cookieB = "";
let interviewId = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

async function createInterview() {
  const res = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  return res.body.interview.id;
}

async function getSession() {
  return request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA);
}

async function submit(questionId, text) {
  return request(app)
    .post(`/api/interviews/${interviewId}/answers`)
    .set("Cookie", cookieA)
    .send({ questionId, responseText: text });
}

beforeEach(async () => {
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  interviewId = await createInterview();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/interviews/:id/start", () => {
  it("creates the question set, starts the interview, returns the first question", async () => {
    const res = await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);

    expect(res.status).toBe(201);
    expect(res.body.phase).toBe("in_progress");
    expect(res.body.interview.status).toBe("IN_PROGRESS");
    expect(res.body.interview.startedAt).toBeTruthy();
    expect(res.body.progress).toEqual({ answered: 0, total: CONFIG.questionCount });
    expect(res.body.currentQuestion).toMatchObject({ order: 1, topic: "React" });
    expect(res.body.currentQuestion).not.toHaveProperty("answer");
    expect(res.body.currentQuestion).not.toHaveProperty("modelAnswer");

    const dbQuestions = await prisma.question.findMany({
      where: { interviewId },
      orderBy: { questionOrder: "asc" },
    });
    expect(dbQuestions).toHaveLength(CONFIG.questionCount);
    expect(dbQuestions.map((q) => q.questionOrder)).toEqual([1, 2, 3]);
  });

  it("hides another user's interview as 404", async () => {
    const res = await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieB);
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app).post(`/api/interviews/${interviewId}/start`);
    expect(res.status).toBe(401);
  });

  it("rejects starting twice", async () => {
    await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    const res = await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_STARTED");
    expect(await prisma.question.count({ where: { interviewId } })).toBe(CONFIG.questionCount);
  });
});

describe("GET /api/interviews/:id/session — resume", () => {
  it("shows the ready phase before start, with the configured count", async () => {
    const res = await getSession();
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe("ready");
    expect(res.body.currentQuestion).toBeNull();
    expect(res.body.progress.total).toBe(CONFIG.questionCount);
  });

  it("returns the first unanswered question mid-interview", async () => {
    await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    const s1 = await getSession();
    await submit(s1.body.currentQuestion.id, "First answer");

    const s2 = await getSession();
    expect(s2.body.phase).toBe("in_progress");
    expect(s2.body.progress).toEqual({ answered: 1, total: 3 });
    expect(s2.body.currentQuestion.order).toBe(2);
  });
});

describe("POST /api/interviews/:id/answers", () => {
  let q1, q2;

  beforeEach(async () => {
    const start = await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    // Answer exactly the first question, so q2 is the current one.
    q1 = start.body.currentQuestion;
    const first = await submit(q1.id, "First answer");
    q2 = first.body.currentQuestion;
  });

  it("rejects answering out of order", async () => {
    // q1 already answered in beforeEach; q3 is not current (q2 is)
    const s = await getSession();
    const currentId = s.body.currentQuestion.id; // q2
    const all = await prisma.question.findMany({ where: { interviewId }, orderBy: { questionOrder: "asc" } });
    const q3 = all[2];

    const res = await submit(q3.id, "Skipping ahead");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OUT_OF_ORDER");
    expect(await prisma.answer.count({ where: { interviewId } })).toBe(1);
    expect(currentId).toBe(q2.id);
  });

  it("rejects a client-supplied question order or status", async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set("Cookie", cookieA)
      .send({ questionId: q2.id, responseText: "x", questionOrder: 3, status: "COMPLETED" });
    expect(res.status).toBe(422);
  });

  it("rejects an empty answer", async () => {
    const res = await submit(q2.id, "   ");
    expect(res.status).toBe(422);
  });

  it("rejects a question from another interview", async () => {
    const otherId = await (async () => {
      const res = await request(app)
        .post("/api/interviews")
        .set("Cookie", cookieB)
        .send({ ...CONFIG, questionCount: 3 });
      await request(app).post(`/api/interviews/${res.body.interview.id}/start`).set("Cookie", cookieB);
      return res.body.interview.id;
    })();
    const foreign = await prisma.question.findFirst({ where: { interviewId: otherId } });

    const res = await submit(foreign.id, "Not my interview's question");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNKNOWN_QUESTION");
  });

  it("treats a repeated submit as idempotent, keeping one row and the first text", async () => {
    const first = await submit(q2.id, "The original answer");
    expect(first.status).toBe(200);
    expect(first.body.alreadyRecorded).toBe(false);
    expect(first.body.currentQuestion.order).toBe(3);

    // Network retry: same question, different payload — must not duplicate.
    const retry = await submit(q2.id, "A changed answer from a retry");
    expect(retry.status).toBe(200);
    expect(retry.body.alreadyRecorded).toBe(true);
    expect(retry.body.currentQuestion.order).toBe(3);

    const rows = await prisma.answer.findMany({ where: { questionId: q2.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].responseText).toBe("The original answer");
  });

  it("advances and reports all answered after the last question", async () => {
    const s = await getSession(); // q2 current
    await submit(s.body.currentQuestion.id, "Second answer");
    const s2 = await getSession();
    const last = await submit(s2.body.currentQuestion.id, "Third answer");

    expect(last.body.phase).toBe("all_answered");
    expect(last.body.progress).toEqual({ answered: 3, total: 3 });
    expect(last.body.currentQuestion).toBeNull();
    expect(last.body.interview.status).toBe("IN_PROGRESS");
  });
});

describe("POST /api/interviews/:id/complete", () => {
  it("refuses to complete while questions remain and time remains", async () => {
    await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/complete`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOT_COMPLETE");
    expect((await prisma.interview.findUnique({ where: { id: interviewId } })).status).toBe("IN_PROGRESS");
  });

  it("completes after all answers, idempotently", async () => {
    await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    let view = (await getSession()).body;
    while (view.currentQuestion) {
      const res = await submit(view.currentQuestion.id, `Answer ${view.currentQuestion.order}`);
      view = res.body;
    }

    const complete = await request(app)
      .post(`/api/interviews/${interviewId}/complete`)
      .set("Cookie", cookieA);
    expect(complete.status).toBe(200);
    expect(complete.body.phase).toBe("completed");
    expect(complete.body.interview.status).toBe("COMPLETED");
    expect(complete.body.interview.completedAt).toBeTruthy();

    const again = await request(app)
      .post(`/api/interviews/${interviewId}/complete`)
      .set("Cookie", cookieA);
    expect(again.status).toBe(200);
    expect(again.body.interview.status).toBe("COMPLETED");

    const finalSession = await getSession();
    expect(finalSession.body.phase).toBe("completed");

    // Further answers are refused.
    const q = await prisma.question.findFirst({ where: { interviewId } });
    const late = await submit(q.id, "Too late");
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("ALREADY_COMPLETED");
  });

  it("allows completing with unanswered questions once time has expired", async () => {
    await request(app).post(`/api/interviews/${interviewId}/start`).set("Cookie", cookieA);
    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    await prisma.interview.update({
      where: { id: interviewId },
      data: { startedAt: new Date(interview.startedAt.getTime() - 32 * 60000) },
    });

    const lateAnswer = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set("Cookie", cookieA)
      .send({ questionId: (await prisma.question.findFirst({ where: { interviewId } })).id, responseText: "Late" });
    expect(lateAnswer.status).toBe(409);
    expect(lateAnswer.body.error.code).toBe("TIME_EXPIRED");

    const complete = await request(app)
      .post(`/api/interviews/${interviewId}/complete`)
      .set("Cookie", cookieA);
    expect(complete.status).toBe(200);
    expect(complete.body.interview.status).toBe("COMPLETED");
    expect(complete.body.progress.answered).toBe(0);
  });
});
