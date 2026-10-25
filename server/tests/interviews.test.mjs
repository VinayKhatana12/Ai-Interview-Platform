// Interview configuration endpoints: creation, validation, ownership,
// pagination, stats, and profile updates. Runs against ai_interview_test.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const USER_A = { name: "Owner A", email: "owner-a@example.com", password: "password-1a" };
const USER_B = { name: "Owner B", email: "owner-b@example.com", password: "password-1b" };

const VALID_CONFIG = {
  roleTitle: "Frontend Developer",
  experienceLevel: "0-1",
  difficulty: "MEDIUM",
  topics: ["React", "JavaScript"],
  mode: "TEXT",
  questionCount: 5,
  durationMinutes: 30,
};

let cookieA = "";
let cookieB = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

beforeEach(async () => {
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/interviews", () => {
  it("creates a draft owned by the session user", async () => {
    const res = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send(VALID_CONFIG);

    expect(res.status).toBe(201);
    expect(res.body.interview).toMatchObject({
      roleTitle: "Frontend Developer",
      status: "PENDING",
      questionCount: 5,
      topics: ["React", "JavaScript"],
      score: null,
    });

    const meRes = await request(app).get("/api/auth/me").set("Cookie", cookieA);
    const dbRow = await prisma.interview.findFirst({ where: { roleTitle: "Frontend Developer" } });
    expect(dbRow.userId).toBe(meRes.body.user.id);
  });

  it("rejects a client-supplied userId instead of trusting it", async () => {
    const meB = await request(app).get("/api/auth/me").set("Cookie", cookieB);
    const res = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send({ ...VALID_CONFIG, userId: meB.body.user.id });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.interview.count()).toBe(0);
  });

  const cases = [
    ["short role title", { roleTitle: "X" }],
    ["unknown experience level", { experienceLevel: "10-20" }],
    ["unknown difficulty", { difficulty: "EXTREME" }],
    ["unknown interview type", { interviewType: "GROUP_DISCUSSION" }],
    ["no topics", { topics: [] }],
    ["topic that is too short", { topics: ["C"] }],
    ["topic that is too long", { topics: ["x".repeat(41)] }],
    ["too many topics", { topics: ["React", "JavaScript", "Node.js", "DBMS", "OOP", "Networks"] }],
    ["unsupported mode", { mode: "VIDEO" }],
    ["too few questions", { questionCount: 2 }],
    ["too many questions", { questionCount: 16 }],
    ["too short", { durationMinutes: 5 }],
    ["too long", { durationMinutes: 95 }],
    ["not a multiple of five", { durationMinutes: 33 }],
  ];
  for (const [label, patch] of cases) {
    it(`rejects ${label} with 422`, async () => {
      const res = await request(app)
        .post("/api/interviews")
        .set("Cookie", cookieA)
        .send({ ...VALID_CONFIG, ...patch });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(res.body.error.details).length).toBeGreaterThan(0);
    });
  }

  it("accepts Phase 4.1 configuration: type, voice, custom topics, 15 questions", async () => {
    const res = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send({
        ...VALID_CONFIG,
        roleTitle: "Java Developer",
        interviewType: "MIXED",
        mode: "VOICE",
        topics: ["React", "Data Structures & Algorithms", "system design", "System Design", "Cloud Basics"],
        questionCount: 15,
        durationMinutes: 45,
      });
    expect(res.status).toBe(201);
    expect(res.body.interview).toMatchObject({
      interviewType: "MIXED",
      mode: "VOICE",
      questionCount: 15,
      durationMinutes: 45,
    });
    // Case-insensitive dedupe collapsed "system design"/"System Design" (last casing wins); custom topics stored.
    expect(res.body.interview.topics).toHaveLength(4);
    expect(res.body.interview.topics).toContain("System Design");
    expect(res.body.interview.topics).toContain("Cloud Basics");
    // A 15-question set generates end to end (fixture path in tests).
    const start = await request(app).post(`/api/interviews/${res.body.interview.id}/start`).set("Cookie", cookieA);
    expect(start.status).toBe(201);
    expect(start.body.currentQuestion.questionType).toBe("technical"); // MIXED alternates, odd index = technical
  });

  it("stores BEHAVIORAL type and generates behavioral fixture questions", async () => {
    const res = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send({ ...VALID_CONFIG, roleTitle: "Backend Developer", interviewType: "BEHAVIORAL" });
    expect(res.body.interview.interviewType).toBe("BEHAVIORAL");
    const start = await request(app).post(`/api/interviews/${res.body.interview.id}/start`).set("Cookie", cookieA);
    expect(start.status).toBe(201);
    expect(start.body.currentQuestion.questionType).toBe("behavioral");
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/interviews").send(VALID_CONFIG);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/interviews", () => {
  it("lists only the session user's interviews, newest first", async () => {
    await request(app).post("/api/interviews").set("Cookie", cookieA).send(VALID_CONFIG);
    await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send({ ...VALID_CONFIG, roleTitle: "Backend Developer" });
    await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieB)
      .send({ ...VALID_CONFIG, roleTitle: "B Private Interview" });

    const res = await request(app).get("/api/interviews").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.interviews.map((i) => i.roleTitle)).not.toContain("B Private Interview");

    const resB = await request(app).get("/api/interviews").set("Cookie", cookieB);
    expect(resB.body.total).toBe(1);
    expect(resB.body.interviews[0].roleTitle).toBe("B Private Interview");
  });

  it("paginates with page and pageSize", async () => {
    for (let i = 1; i <= 12; i++) {
      await prisma.interview.create({
        data: {
          userId: (await request(app).get("/api/auth/me").set("Cookie", cookieA)).body.user.id,
          roleTitle: `Role ${String(i).padStart(2, "0")}`,
          experienceLevel: "0-1",
          difficulty: "MEDIUM",
          mode: "TEXT",
          status: "PENDING",
          durationMinutes: 30,
          topics: ["React"],
          questionCount: 5,
        },
      });
    }

    const page1 = await request(app)
      .get("/api/interviews?page=1&pageSize=10")
      .set("Cookie", cookieA);
    expect(page1.body.total).toBe(12);
    expect(page1.body.totalPages).toBe(2);
    expect(page1.body.interviews).toHaveLength(10);
    expect(page1.body.interviews[0].roleTitle).toBe("Role 12");

    const page2 = await request(app)
      .get("/api/interviews?page=2&pageSize=10")
      .set("Cookie", cookieA);
    expect(page2.body.interviews).toHaveLength(2);
    expect(page2.body.interviews[1].roleTitle).toBe("Role 01");
  });

  it("caps pageSize at 20", async () => {
    const res = await request(app)
      .get("/api/interviews?pageSize=100")
      .set("Cookie", cookieA);
    expect(res.status).toBe(422);
  });
});

describe("GET /api/interviews/:id — ownership", () => {
  it("returns the interview to its owner", async () => {
    const created = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send(VALID_CONFIG);
    const res = await request(app)
      .get(`/api/interviews/${created.body.interview.id}`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.interview.id).toBe(created.body.interview.id);
  });

  it("hides another user's interview as 404", async () => {
    const created = await request(app)
      .post("/api/interviews")
      .set("Cookie", cookieA)
      .send(VALID_CONFIG);
    const res = await request(app)
      .get(`/api/interviews/${created.body.interview.id}`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/interviews/some-id");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/interviews/stats", () => {
  it("reports honest zeros for a fresh account", async () => {
    const res = await request(app).get("/api/interviews/stats").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      drafts: 0,
      inProgress: 0,
      completed: 0,
      avgScore: null,
      bestScore: null,
      answeredTotal: 0,
      practiceMinutes: 0,
      recentScores: [],
    });
  });

  it("counts only the session user's interviews", async () => {
    await request(app).post("/api/interviews").set("Cookie", cookieA).send(VALID_CONFIG);
    await request(app).post("/api/interviews").set("Cookie", cookieA).send(VALID_CONFIG);
    await request(app).post("/api/interviews").set("Cookie", cookieB).send(VALID_CONFIG);

    const res = await request(app).get("/api/interviews/stats").set("Cookie", cookieA);
    expect(res.body.total).toBe(2);
    expect(res.body.drafts).toBe(2);
    expect(res.body.avgScore).toBeNull();
    expect(res.body.bestScore).toBeNull();
    expect(res.body.answeredTotal).toBe(0);
    expect(res.body.recentScores).toEqual([]);
  });
});

describe("PATCH /api/auth/me", () => {
  it("updates name and experience level for the session user only", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Cookie", cookieA)
      .send({ name: "Owner A Renamed", experienceLevel: "1-3" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Owner A Renamed");
    expect(res.body.user.experienceLevel).toBe("1-3");
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const other = await prisma.user.findUnique({ where: { email: USER_B.email } });
    expect(other.name).toBe(USER_B.name);
    expect(other.experienceLevel).toBeNull();
  });

  it("can clear the experience level", async () => {
    await request(app).patch("/api/auth/me").set("Cookie", cookieA).send({ experienceLevel: "5+" });
    const res = await request(app).patch("/api/auth/me").set("Cookie", cookieA).send({ experienceLevel: null });
    expect(res.body.user.experienceLevel).toBeNull();
  });

  it("rejects an invalid experience level and digit names", async () => {
    const bad = await request(app)
      .patch("/api/auth/me")
      .set("Cookie", cookieA)
      .send({ experienceLevel: "10-20" });
    expect(bad.status).toBe(422);

    const badName = await request(app)
      .patch("/api/auth/me")
      .set("Cookie", cookieA)
      .send({ name: "A1" });
    expect(badName.status).toBe(422);
  });

  it("rejects attempts to change email or role", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Cookie", cookieA)
      .send({ email: "hacker@example.com", role: "ADMIN" });
    expect(res.status).toBe(422);
    const user = await prisma.user.findUnique({ where: { email: USER_A.email } });
    expect(user.role).toBe("CANDIDATE");
  });
});
