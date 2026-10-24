// Google Gemini REST client. Server-only; never imported by the client.
//
// Hardened by design:
//  - API key read from env at call time and sent only to Google's endpoint.
//  - Per-request timeout (AbortController), capped prompt and output sizes.
//  - Retries ONLY transient failures (429 / 5xx / network) with small
//    backoff, honoring Retry-After when present; 4xx is a hard failure.
//  - The caller owns validation; this module returns parsed JSON or throws
//    a typed AiError with a stable code.
import { env } from "../../config/env.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class AiError extends Error {
  constructor(code, message, { status = 503, cause } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

const MAX_PROMPT_CHARS = 24000; // ~3x the largest legitimate prompt
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini({ prompt, system, responseSchema, maxOutputTokens }) {
  const apiKey = env.AI_API_KEY;
  if (!apiKey) {
    throw new AiError("AI_NOT_CONFIGURED", "AI_API_KEY is not set on the server.");
  }
  const userPrompt = prompt.slice(0, MAX_PROMPT_CHARS);

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      maxOutputTokens,
      temperature: 0.7,
    },
  };

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${GEMINI_BASE}/models/${encodeURIComponent(env.AI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (!text.trim()) {
          throw new AiError("AI_EMPTY_RESPONSE", "The AI provider returned no content.");
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new AiError("AI_BAD_JSON", "The AI provider returned malformed JSON.");
        }
      }

      const detail = await res.text().catch(() => "");
      if (!RETRYABLE_STATUS.has(res.status)) {
        throw new AiError(
          "AI_REQUEST_FAILED",
          `The AI provider rejected the request (HTTP ${res.status}).`,
          { status: 502 },
        );
      }
      lastError = new AiError(
        "AI_TRANSIENT",
        `The AI provider is busy (HTTP ${res.status}). ${detail.slice(0, 120)}`,
      );
      const retryAfter = Number(res.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : RETRY_DELAYS_MS[attempt];
      if (attempt < RETRY_DELAYS_MS.length) await sleep(delayMs ?? 1000);
    } catch (err) {
      if (err instanceof AiError) {
        if (err.code !== "AI_TRANSIENT") throw err;
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      } else if (err.name === "AbortError") {
        lastError = new AiError("AI_TIMEOUT", "The AI provider timed out.");
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      } else {
        lastError = new AiError("AI_NETWORK", "Could not reach the AI provider.", { cause: err });
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new AiError("AI_TRANSIENT", "The AI provider is unavailable.");
}

export async function generateJson({ prompt, system, responseSchema, maxOutputTokens = 2048 }) {
  return callGemini({ prompt, system, responseSchema, maxOutputTokens });
}
