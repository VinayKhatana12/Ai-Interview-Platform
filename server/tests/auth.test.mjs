// Auth API flows: register, duplicate email, validation, wrong password,
// unknown email, login, /me signed in and out, logout, and response hygiene.
// Runs against the ai_interview_test database (see vitest.config.mjs).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const TEST_ACCOUNT = {
  name: "Test Candidate",
  email: "test.account@example.com",
  password: "correct-password-1",
};

function uniqueEmail() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function cookieFrom(res) {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return null;
  const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) =>
    c.startsWith("session="),
  );
  return session ? session.split(";")[0] : null;
}

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("creates an account, signs the user in, and never exposes the hash", async () => {
    const res = await request(app).post("/api/auth/register").send(TEST_ACCOUNT);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: TEST_ACCOUNT.name,
      email: TEST_ACCOUNT.email,
      role: "CANDIDATE",
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const cookie = cookieFrom(res);
    expect(cookie).toBeTruthy();
    expect(res.headers["set-cookie"].join(" ")).toContain("HttpOnly");
    expect(res.headers["set-cookie"].join(" ")).toContain("SameSite=Lax");

    const dbUser = await prisma.user.findUnique({ where: { email: TEST_ACCOUNT.email } });
    expect(dbUser).toBeTruthy();
    expect(dbUser.passwordHash).not.toBe(TEST_ACCOUNT.password);
    expect(dbUser.passwordHash.startsWith("$2")).toBe(true); // bcrypt format
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/auth/register").send(TEST_ACCOUNT);
    const res = await request(app).post("/api/auth/register").send(TEST_ACCOUNT);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("normalizes the email to lowercase before storing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...TEST_ACCOUNT, email: "Test.Account@Example.COM", });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(TEST_ACCOUNT.email);
  });

  it("returns per-field details for invalid input", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "not-an-email",
      password: "short",
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(["name", "email", "password"]),
    );
  });

  it("rejects a password without a number", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...TEST_ACCOUNT, email: uniqueEmail(), password: "onlyletters" });

    expect(res.status).toBe(422);
    expect(res.body.error.details.password).toContain("number");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(TEST_ACCOUNT);
  });

  it("signs in with correct credentials and sets an HttpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: TEST_ACCOUNT.email,
      password: TEST_ACCOUNT.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_ACCOUNT.email);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const cookie = cookieFrom(res);
    expect(cookie).toBeTruthy();
    expect(res.headers["set-cookie"].join(" ")).toContain("HttpOnly");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(TEST_ACCOUNT.email);
  });

  it("rejects a wrong password with a generic error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ACCOUNT.email, password: "wrong-password-9" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.error.message).toBe("Invalid email or password.");
    expect(cookieFrom(res)).toBeNull();
  });

  it("gives the identical error for an unknown email", async () => {
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever-1" });

    const wrongPw = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ACCOUNT.email, password: "wrong-password-9" });

    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toEqual(wrongPw.body.error);
  });

  it("finds the account regardless of email case", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "TEST.ACCOUNT@EXAMPLE.COM",
      password: TEST_ACCOUNT.password,
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user", async () => {
    const reg = await request(app).post("/api/auth/register").send(TEST_ACCOUNT);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookieFrom(reg));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_ACCOUNT.email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 when signed out", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 for a tampered cookie", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "session=not.a.real.token");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const reg = await request(app).post("/api/auth/register").send(TEST_ACCOUNT);
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookieFrom(reg));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The clear instruction expires the cookie in the browser.
    expect(res.headers["set-cookie"].join(" ")).toMatch(/session=;|Expires=Thu, 01 Jan 1970/);
  });

  it("is idempotent when already signed out", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});
