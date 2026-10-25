// Text-to-speech endpoint tests. Both providers are mocked (openai module +
// fetch for Gemini), so no keys, no network, no credits. Covers: generation,
// provider selection, ownership/state/trusted-question rules, the 4096-char
// ceiling, error mapping, and repeat requests.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

const mockSpeechCreate = vi.fn();

vi.mock("openai", () => {
  class FakeAPIError extends Error {
    constructor(status) {
      super(`simulated provider error ${status}`);
      this.status = status;
    }
  }
  return {
    default: class FakeOpenAI {
      constructor() {
        return {
          audio: {
            speech: { create: mockSpeechCreate },
          },
        };
      }
    },
    __ttsError: FakeAPIError,
  };
});

import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { __ttsError } from "openai";

const USER_A = { name: "Tts Owner", email: "tts-owner@example.com", password: "password-1a" };
const USER_B = { name: "Tts Other", email: "tts-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Voice TTS Check",
  experienceLevel: "0-1",
  difficulty: "EASY",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 20,
};

const RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]); // "RIFF....WAVE"
const MP3_STUB = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]); // MPEG frame sync

let cookieA = "";
let cookieB = "";
let interviewId = "";
let questionId = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

async function setupInterview() {
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  const id = created.body.interview.id;
  await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookieA);
  const session = await request(app).get(`/api/interviews/${id}/session`).set("Cookie", cookieA);
  return { id, questionId: session.body.currentQuestion.id };
}

function postSpeech(cookie = cookieA, qid = questionId) {
  return request(app)
    .post(`/api/interviews/${interviewId}/speech`)
    .set("Cookie", cookie)
    .send({ questionId: qid });
}

function stubGemini(responses) {
  const queue = [...responses];
  return vi.fn(async () => queue.shift() ?? {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: RIFF.toString("base64") } }] } }] }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockSpeechCreate.mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  ({ id: interviewId, questionId } = await setupInterview());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/interviews/:id/speech — Gemini provider (primary)", () => {
  it("returns WAV audio binary with the provider named in the header", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", stubGemini([]));

    const res = await postSpeech();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/wav");
    expect(res.headers["x-voice-source"]).toBe("gemini");
    expect(res.headers["cache-control"]).toBe("no-store");
    // Binary body, not base64 JSON.
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 4).toString("ascii")).toBe("RIFF");
    const url = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(String(url)).toContain("gemini-3.8-flash-tts");
  });

  it("retries transient high-demand 503s and succeeds", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      stubGemini([
        { ok: false, status: 503, json: async () => ({ error: { status: "UNAVAILABLE" } }) },
      ]),
    );

    const res = await postSpeech();
    expect(res.status).toBe(200);
    expect(res.headers["x-voice-source"]).toBe("gemini");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  }, 20000);

  it("maps provider failures without internals", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      stubGemini([
        { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) },
        { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) },
        { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) },
        { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) },
      ]),
    );
    const failed = await postSpeech();
    expect(failed.status).toBe(503); // retried then exhausted -> provider failed
    expect(failed.body.error.code).toBe("TTS_PROVIDER_FAILED");
    expect(JSON.stringify(failed.body)).not.toContain("simulated");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(4);
  }, 30000);
});

describe("POST /api/interviews/:id/speech — OpenAI provider (alternative)", () => {
  it("uses gpt-4o-mini-tts with the marin voice when only OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    mockSpeechCreate.mockResolvedValueOnce({
      arrayBuffer: async () => MP3_STUB.buffer.slice(MP3_STUB.byteOffset, MP3_STUB.byteOffset + MP3_STUB.length),
    });

    const res = await postSpeech();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["x-voice-source"]).toBe("openai");
    expect(res.body[0]).toBe(0xff);
    expect(mockSpeechCreate).toHaveBeenCalledTimes(1);
    const args = mockSpeechCreate.mock.calls[0][0];
    expect(args.model).toBe("gpt-4o-mini-tts");
    expect(args.voice).toBe("marin");
  });

  it("maps insufficient quota to an honest 402", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const err = new __ttsError(429);
    err.error = { type: "insufficient_quota" };
    mockSpeechCreate.mockRejectedValueOnce(err);

    const res = await postSpeech();
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("TTS_NO_CREDITS");
  });

  it("maps provider 500s to a generic 502", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    mockSpeechCreate.mockRejectedValueOnce(new __ttsError(500));
    const res = await postSpeech();
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("TTS_PROVIDER_FAILED");
  });
});

describe("POST /api/interviews/:id/speech — rules", () => {
  it("requires authentication", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/speech`)
      .send({ questionId });
    expect(res.status).toBe(401);
  });

  it("hides another user's interview as 404", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    const res = await postSpeech(cookieB);
    expect(res.status).toBe(404);
  });

  it("rejects a question that is not part of the interview", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", stubGemini([]));
    const res = await postSpeech(cookieA, "00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed questionId with 422", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/speech`)
      .set("Cookie", cookieA)
      .send({ questionId: "not-a-uuid" });
    expect(res.status).toBe(422);
  });

  it("enforces the 4096-character ceiling", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", stubGemini([]));
    await prisma.question.update({
      where: { id: questionId },
      data: { text: "x".repeat(4097) },
    });
    const res = await postSpeech();
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("QUESTION_TOO_LONG");
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it("enforces session state (PENDING and COMPLETED)", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    const pending = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
    const pRes = await request(app)
      .post(`/api/interviews/${pending.body.interview.id}/speech`)
      .set("Cookie", cookieA)
      .send({ questionId });
    expect(pRes.status).toBe(409);
    expect(pRes.body.error.code).toBe("NOT_STARTED");

    // Complete the current interview legitimately, then re-ask.
    let view = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    while (view.currentQuestion) {
      const res = await request(app)
        .post(`/api/interviews/${interviewId}/answers`)
        .set("Cookie", cookieA)
        .send({ questionId: view.currentQuestion.id, responseText: "A text answer for TTS state tests." });
      view = res.body;
    }
    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
    const cRes = await postSpeech();
    expect(cRes.status).toBe(409);
    expect(cRes.body.error.code).toBe("ALREADY_COMPLETED");
  });

  it("returns 503 with a clear message when no provider key is configured", async () => {
    const res = await postSpeech();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("TTS_NOT_CONFIGURED");
  });

  it("allows repeat requests (stateless, no storage)", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", stubGemini([]));
    const first = await postSpeech();
    const second = await postSpeech();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });
});
