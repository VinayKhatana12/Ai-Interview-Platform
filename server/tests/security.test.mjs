// Phase 5.1 security hardening tests: JWT rejection paths, URL param/query
// validation, CORS allowlist behavior, upload magic-byte sniffing, the
// rate-limit envelope, env startup failure, health/readiness, and request
// correlation ids. STT provider is mocked — no network, no credits.
//
// This file sets CORS_ORIGINS BEFORE importing the app, so this file's
// module graph runs with CORS enabled; other test files (own module graph
// under vitest isolation) keep running same-origin.
process.env.CORS_ORIGINS = "https://app.example.com";

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const sttTranscribe = vi.hoisted(() => vi.fn());
vi.mock("../src/services/ai/sttProvider.js", () => ({
  transcriptionProviderName: () => "mock",
  isTranscriptionConfigured: () => true,
  transcribeAudio: (...args) => sttTranscribe(...args),
}));

const { app } = await import("../src/app.js");
const { prisma } = await import("../src/db/prisma.js");
const { env } = await import("../src/config/env.js");
const { jsonErrorEnvelope } = await import("../src/middleware/rateLimit.js");

const USER = { name: "Security Owner", email: "security-owner@example.com", password: "password-1a" };
const CONFIG = {
  roleTitle: "Security Run",
  experienceLevel: "0-1",
  difficulty: "EASY",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 30,
};

let cookie = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

beforeEach(async () => {
  sttTranscribe.mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER);
  cookie = await signIn(USER);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("JWT hardening", () => {
  const base = { sub: "00000000-0000-4000-8000-000000000000", role: "CANDIDATE" };

  it("rejects a token signed with the wrong secret", async () => {
    const token = jwt.sign(base, "wrong-secret-wrong-secret-wrong-secret-123456", {
      expiresIn: "7d",
      issuer: "ai-interview-platform",
    });
    const res = await request(app).get("/api/auth/me").set("Cookie", `session=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an expired token", async () => {
    const token = jwt.sign(base, env.JWT_SECRET, {
      expiresIn: -10, // already expired
      issuer: "ai-interview-platform",
    });
    const res = await request(app).get("/api/auth/me").set("Cookie", `session=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a token from another issuer", async () => {
    const token = jwt.sign(base, env.JWT_SECRET, { expiresIn: "7d", issuer: "not-our-platform" });
    const res = await request(app).get("/api/auth/me").set("Cookie", `session=${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const token = jwt.sign(base, env.JWT_SECRET, {
      expiresIn: "7d",
      issuer: "ai-interview-platform",
    });
    const tampered = token.slice(0, -1) + (token.endsWith("x") ? "y" : "x");
    const res = await request(app).get("/api/auth/me").set("Cookie", `session=${tampered}`);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown sub (deleted user) even with a valid signature", async () => {
    const token = jwt.sign(base, env.JWT_SECRET, {
      expiresIn: "7d",
      issuer: "ai-interview-platform",
    });
    const res = await request(app).get("/api/auth/me").set("Cookie", `session=${token}`);
    expect(res.status).toBe(401);
  });
});

describe("route param and query validation", () => {
  it("answers 422 (not a 500) for an invalid :id", async () => {
    const res = await request(app).get("/api/interviews/ab%24cd").set("Cookie", cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("answers 422 for an over-long :id", async () => {
    const res = await request(app).get(`/api/interviews/${"x".repeat(200)}`).set("Cookie", cookie);
    expect(res.status).toBe(422);
  });

  it("requires the compare ?with= param", async () => {
    const res = await request(app)
      .get("/api/interviews/00000000-0000-4000-8000-000000000000/compare")
      .set("Cookie", cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.details.with).toBeDefined();
  });

  it("rejects a repeated with param (array) instead of passing it to Prisma", async () => {
    const res = await request(app)
      .get("/api/interviews/00000000-0000-4000-8000-000000000000/compare")
      .query("with=11111111-1111-4111-8111-111111111111&with=22222222-2222-4222-8222-222222222222")
      .set("Cookie", cookie);
    expect(res.status).toBe(422);
  });

  it("lets a well-formed but nonexistent id reach the ownership path (404)", async () => {
    const res = await request(app)
      .get("/api/interviews/99999999-9999-4999-8999-999999999999/compare")
      .query({ with: "88888888-8888-4888-8888-888888888888" })
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("CORS allowlist", () => {
  it("echoes an allowed origin with credentials", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://app.example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("gives a disallowed origin no CORS headers", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers an allowed preflight", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://app.example.com")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("leaves no-origin (same-origin) requests alone", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("audio upload validation", () => {
  async function startInterview() {
    const created = await request(app).post("/api/interviews").set("Cookie", cookie).send(CONFIG);
    const id = created.body.interview.id;
    await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookie);
    return id;
  }

  it("rejects a buffer whose magic bytes do not match its declared type", async () => {
    const id = await startInterview();
    const garbage = Buffer.alloc(2048, 0x41); // "AAAA…" not an audio container
    const res = await request(app)
      .post(`/api/interviews/${id}/transcribe`)
      .set("Cookie", cookie)
      .attach("audio", garbage, { filename: "answer.webm", contentType: "audio/webm" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNSUPPORTED_AUDIO_TYPE");
    expect(sttTranscribe).not.toHaveBeenCalled();
  });

  it("hands audio to the provider only when the magic bytes match", async () => {
    const id = await startInterview();
    const webm = Buffer.alloc(2048);
    webm[0] = 0x1a;
    webm[1] = 0x45;
    webm[2] = 0xdf;
    webm[3] = 0xa3; // EBML (WebM) signature
    sttTranscribe.mockResolvedValue("hello from the mocked provider");
    const res = await request(app)
      .post(`/api/interviews/${id}/transcribe`)
      .set("Cookie", cookie)
      .attach("audio", webm, { filename: "answer.webm", contentType: "audio/webm" });
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("hello from the mocked provider");
    expect(sttTranscribe).toHaveBeenCalledTimes(1);
  });

  it("rejects recordings below the minimum size", async () => {
    const id = await startInterview();
    const res = await request(app)
      .post(`/api/interviews/${id}/transcribe`)
      .set("Cookie", cookie)
      .attach("audio", Buffer.alloc(128, 0x1a), { filename: "answer.webm", contentType: "audio/webm" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_AUDIO");
  });
});

describe("rate limit envelope", () => {
  it("returns the standard error envelope on 429", async () => {
    const rlApp = express();
    rlApp.set("trust proxy", 1);
    rlApp.post(
      "/limited",
      // express-rate-limit at limit 1 with the shared envelope handler.
      (await import("express-rate-limit")).default({
        windowMs: 60_000,
        limit: 1,
        standardHeaders: false,
        legacyHeaders: false,
        handler: jsonErrorEnvelope(429, "RATE_LIMITED", "Too many attempts."),
      }),
      (req, res) => res.json({ ok: true }),
    );

    const first = await request(rlApp).post("/limited");
    expect(first.status).toBe(200);
    const second = await request(rlApp).post("/limited");
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("env startup validation", () => {
  it("fails fast when JWT_SECRET is missing or too short", async () => {
    const envUrl = new URL("../src/config/env.js", import.meta.url).href;
    const code = `await import(${JSON.stringify(envUrl)})`;
    await expect(
      execFileP(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, JWT_SECRET: "short" },
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("JWT_SECRET") });
  });
});

describe("health, readiness and correlation ids", () => {
  it("reports health and readiness with the database up", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true, db: true });

    const ready = await request(app).get("/api/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ ok: true, db: true });
  });

  it("echoes a well-formed request id and mints one otherwise", async () => {
    const echoed = await request(app).get("/api/health").set("x-request-id", "my-trace-id-12345");
    expect(echoed.headers["x-request-id"]).toBe("my-trace-id-12345");

    const fresh = await request(app).get("/api/health").set("x-request-id", "not a valid id!");
    expect(fresh.headers["x-request-id"]).toMatch(/^[\w.-]{8,64}$/);
  });

  it("sets baseline security headers and hides the framework name", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
