// Speech-to-text endpoint tests. The OpenAI SDK is MOCKED (vi.mock), so no
// key, no network, no credits. Covers: valid audio, empty/unsupported/
// oversized uploads, missing key, provider failures, ownership, session
// state, retries, and envelope shape.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

const mockCreate = vi.fn();
const mockOpenAIInstance = { audio: { transcriptions: { create: mockCreate } } };

vi.mock("openai", () => {
  class FakeAPIError extends Error {
    constructor(status) {
      super(`simulated provider error ${status}`);
      this.status = status;
    }
  }
  class FakeTimeoutError extends Error {
    constructor() {
      super("request timed out");
      this.name = "APIConnectionTimeoutError";
    }
  }
  class FakeConnectionError extends Error {
    constructor() {
      super("connection failed");
      this.name = "APIConnectionError";
    }
  }
  return {
    default: class FakeOpenAI {
      constructor() {
        return mockOpenAIInstance;
      }
    },
    toFile: async (buf) => buf,
    __errors: { FakeAPIError, FakeTimeoutError, FakeConnectionError },
  };
});

import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { __errors } from "openai";

const { FakeAPIError, FakeTimeoutError, FakeConnectionError } = __errors;

const USER_A = { name: "Stt Owner", email: "stt-owner@example.com", password: "password-1a" };
const USER_B = { name: "Stt Other", email: "stt-other@example.com", password: "password-1b" };

const CONFIG = {
  roleTitle: "Voice Transcription Check",
  experienceLevel: "0-1",
  difficulty: "EASY",
  topics: ["React"],
  mode: "TEXT",
  questionCount: 3,
  durationMinutes: 20,
};

// A recording-shaped fixture: real WebM (EBML) magic bytes. The upload
// validation now sniffs the container header rather than trusting the
// client-declared MIME type, so the "valid recording" fixture must be one.
const audioBuffer = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(4092, 7)]);

let cookieA = "";
let cookieB = "";
let interviewId = "";

async function signIn(user) {
  const res = await request(app).post("/api/auth/login").send(user);
  return res.headers["set-cookie"].find((c) => c.startsWith("session=")).split(";")[0];
}

async function createStartedInterview() {
  const created = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
  const id = created.body.interview.id;
  await request(app).post(`/api/interviews/${id}/start`).set("Cookie", cookieA);
  return id;
}

function postAudio(cookie = cookieA, buffer = audioBuffer, filename = "recording.webm", type = "audio/webm") {
  return request(app)
    .post(`/api/interviews/${interviewId}/transcribe`)
    .set("Cookie", cookie)
    .attach("audio", buffer, { filename, contentType: type });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockCreate.mockReset();
  await prisma.user.deleteMany();
  await request(app).post("/api/auth/register").send(USER_A);
  await request(app).post("/api/auth/register").send(USER_B);
  cookieA = await signIn(USER_A);
  cookieB = await signIn(USER_B);
  process.env.OPENAI_API_KEY = "test-openai-key";
  interviewId = await createStartedInterview();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/interviews/:id/transcribe", () => {
  it("returns the transcript for a valid recording", async () => {
    mockCreate.mockResolvedValueOnce({ text: "  The virtual DOM is a lightweight copy of the UI.  " });

    const res = await postAudio();
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("The virtual DOM is a lightweight copy of the UI.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe("gpt-transcribe");
    // No internals in the response envelope.
    expect(JSON.stringify(res.body)).not.toContain("error");
  });

  it("is stateless: repeat requests re-run and return again", async () => {
    mockCreate.mockResolvedValue({ text: "First attempt transcript." });
    const first = await postAudio();
    const second = await postAudio();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing file", async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/transcribe`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_AUDIO");
  });

  it("rejects an empty recording", async () => {
    const res = await postAudio(cookieA, Buffer.alloc(100, 0));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_AUDIO");
  });

  it("rejects an unsupported file type", async () => {
    const res = await postAudio(cookieA, Buffer.alloc(4096, 1), "notes.txt", "text/plain");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNSUPPORTED_AUDIO_TYPE");
  });

  it("accepts the audio/webm;codecs=opus mime the recorder produces", async () => {
    mockCreate.mockResolvedValueOnce({ text: "Opus transcript." });
    const res = await postAudio(cookieA, audioBuffer, "recording.webm", "audio/webm;codecs=opus");
    expect(res.status).toBe(200);
  });

  it("returns 413 for uploads above 25 MB", async () => {
    const huge = Buffer.alloc(25 * 1024 * 1024 + 1024, 1);
    const res = await postAudio(cookieA, huge);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("AUDIO_TOO_LARGE");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 503 with a clear message when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await postAudio();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("STT_NOT_CONFIGURED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps a provider 500 to a generic 502 without internals", async () => {
    mockCreate.mockRejectedValueOnce(new FakeAPIError(500));
    const res = await postAudio();
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("STT_PROVIDER_FAILED");
    expect(res.body.error.message).not.toContain("simulated");
  });

  it("maps provider rate limits, invalid audio and timeouts", async () => {
    mockCreate.mockRejectedValueOnce(new FakeAPIError(429));
    const limited = await postAudio();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("STT_RATE_LIMITED");

    const noCredits = new FakeAPIError(429);
    noCredits.error = { type: "insufficient_quota" };
    mockCreate.mockRejectedValueOnce(noCredits);
    const credits = await postAudio();
    expect(credits.status).toBe(402);
    expect(credits.body.error.code).toBe("STT_NO_CREDITS");

    mockCreate.mockRejectedValueOnce(new FakeAPIError(400));
    const invalid = await postAudio();
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("STT_INVALID_AUDIO");

    mockCreate.mockRejectedValueOnce(new FakeTimeoutError());
    const timedOut = await postAudio();
    expect(timedOut.status).toBe(504);
    expect(timedOut.body.error.code).toBe("STT_TIMEOUT");

    mockCreate.mockRejectedValueOnce(new FakeConnectionError());
    const unreachable = await postAudio();
    expect(unreachable.status).toBe(503);
    expect(unreachable.body.error.code).toBe("STT_UNREACHABLE");
  });

  it("rejects an empty transcript from the provider", async () => {
    mockCreate.mockResolvedValueOnce({ text: "   " });
    const res = await postAudio();
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_TRANSCRIPT");
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/transcribe`)
      .attach("audio", audioBuffer, { filename: "r.webm", contentType: "audio/webm" });
    expect(res.status).toBe(401);
  });

  it("hides another user's interview as 404", async () => {
    mockCreate.mockResolvedValue({ text: "x" });
    const res = await postAudio(cookieB);
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("enforces session state rules", async () => {
    const pending = await request(app).post("/api/interviews").set("Cookie", cookieA).send(CONFIG);
    const pRes = await request(app)
      .post(`/api/interviews/${pending.body.interview.id}/transcribe`)
      .set("Cookie", cookieA)
      .attach("audio", audioBuffer, { filename: "r.webm", contentType: "audio/webm" });
    expect(pRes.status).toBe(409);
    expect(pRes.body.error.code).toBe("NOT_STARTED");

    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA).catch(() => null);
    // Complete legitimately: answer all questions first.
    let view = (await request(app).get(`/api/interviews/${interviewId}/session`).set("Cookie", cookieA)).body;
    while (view.currentQuestion) {
      const res = await request(app)
        .post(`/api/interviews/${interviewId}/answers`)
        .set("Cookie", cookieA)
        .send({ questionId: view.currentQuestion.id, responseText: "A full text answer." });
      view = res.body;
    }
    await request(app).post(`/api/interviews/${interviewId}/complete`).set("Cookie", cookieA);
    const cRes = await postAudio();
    expect(cRes.status).toBe(409);
    expect(cRes.body.error.code).toBe("ALREADY_COMPLETED");
  });

  it("refuses transcription once the interview clock has expired", async () => {
    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    await prisma.interview.update({
      where: { id: interviewId },
      data: { startedAt: new Date(interview.startedAt.getTime() - 22 * 60000) },
    });
    const res = await postAudio();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TIME_EXPIRED");
  });
});

describe("POST /api/interviews/:id/transcribe — Gemini provider (fetch stubbed)", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  function stubGemini(responses) {
    const queue = [...responses];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const next = queue.shift() ?? { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ audioTranscription: { text: "fallback text" } }] } }] }) };
        return next;
      }),
    );
  }

  it("uses Gemini when AI_API_KEY is set, even with an OpenAI key present", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    stubGemini([
      {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ audioTranscription: { text: "  Gemini heard this answer.  " } }] } }],
        }),
      },
    ]);

    const res = await postAudio();
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("Gemini heard this answer.");
    const url = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(String(url)).toContain("gemini-3.5-transcribe");
    // OpenAI SDK untouched: provider selection picked Gemini.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retries transient 503 high-demand responses and succeeds", async () => {
    process.env.AI_API_KEY = "test-gemini-key";
    stubGemini([
      { ok: false, status: 503, json: async () => ({ error: { status: "UNAVAILABLE" } }) },
      {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ audioTranscription: { text: "After retry." } }] } }] }),
      },
    ]);

    const res = await postAudio();
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("After retry.");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it("maps rate limits, invalid audio and oversized payloads", async () => {
    process.env.AI_API_KEY = "test-gemini-key";

    stubGemini([
      { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) },
      { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) },
      { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) },
      { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) },
    ]);
    const limited = await postAudio();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("STT_RATE_LIMITED");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();

    stubGemini([{ ok: false, status: 400, json: async () => ({ error: { code: 400 } }) }]);
    const invalid = await postAudio();
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("STT_INVALID_AUDIO");
    vi.unstubAllGlobals();

    // Over the 14 MB inline ceiling for the Gemini tier (before any fetch).
    stubGemini([]);
    const hugeWebm = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.alloc(15 * 1024 * 1024 - 4, 1),
    ]);
    const huge = await postAudio(cookieA, hugeWebm);
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe("AUDIO_TOO_LARGE");
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  }, 20000);

  it("falls back to OpenAI when only OPENAI_API_KEY is set", async () => {
    mockCreate.mockResolvedValueOnce({ text: "OpenAI path transcript." });
    const res = await postAudio();
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("OpenAI path transcript.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
