// Google Gemini speech-to-text (gemini-3.5-transcribe via generateContent),
// server-only, using the same free-tier AI_API_KEY as the rest of the app.
//
// Measured behavior (2026-10): the model answers in ~2-3 s but intermittently
// returns 503 "high demand" — so this client retries 429/5xx with backoff.
// Audio is sent as inline base64; Gemini caps inline payloads at ~20 MB,
// which base64 inflation turns into a 14 MB practical audio ceiling.
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/HttpError.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = process.env.STT_MODEL || "gemini-3.5-transcribe";
const MAX_INLINE_AUDIO_BYTES = 14 * 1024 * 1024;
const RETRY_DELAYS_MS = [1500, 3000, 5000];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function geminiTranscribeAudio({ buffer, mimeType }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "STT_NOT_CONFIGURED",
      "Transcription is not configured on this server. Add AI_API_KEY or OPENAI_API_KEY to server/.env.",
    );
  }
  if (buffer.length > MAX_INLINE_AUDIO_BYTES) {
    throw new HttpError(
      413,
      "AUDIO_TOO_LARGE",
      "The recording is too large for the free transcription tier (14 MB). Record a shorter answer.",
    );
  }

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: mimeType || "audio/webm", data: buffer.toString("base64") } }],
      },
    ],
  });

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const transcript = parts
          .map((p) => p.audioTranscription?.text ?? p.text ?? "")
          .join("")
          .trim();
        if (!transcript) {
          throw new HttpError(422, "EMPTY_TRANSCRIPT", "No speech was detected in the recording. Try recording again.");
        }
        return transcript;
      }

      const detail = await res.json().catch(() => ({}));
      const status = res.status;
      if (!RETRYABLE_STATUS.has(status)) {
        if (status === 400 || status === 422) {
          console.error(`[stt:gemini] provider rejected audio: status=${status}`);
          throw new HttpError(422, "STT_INVALID_AUDIO", "The recording could not be transcribed. Try recording again.");
        }
        console.error(`[stt:gemini] provider error status=${status}`);
        throw new HttpError(502, "STT_PROVIDER_FAILED", "Transcription failed on the provider side. Try again.");
      }

      // Retryable: free-tier rate limits / high-demand 503s.
      console.error(`[stt:gemini] transient status=${status}, attempt ${attempt + 1}`);
      lastError =
        status === 429
          ? new HttpError(429, "STT_RATE_LIMITED", "The transcription service is busy. Wait a moment and try again.")
          : new HttpError(503, "STT_PROVIDER_FAILED", "Transcription failed on the provider side. Try again.");
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === "STT_PROVIDER_FAILED" && err.status === 503) {
          lastError = err;
          if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw err;
      }
      if (err.name === "AbortError") {
        lastError = new HttpError(504, "STT_TIMEOUT", "Transcription took too long. Try again.");
      } else {
        console.error(`[stt:gemini] network failure: ${err?.constructor?.name ?? "Error"}`);
        lastError = new HttpError(503, "STT_UNREACHABLE", "Could not reach the transcription service. Try again.");
      }
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new HttpError(503, "STT_PROVIDER_FAILED", "Transcription failed on the provider side. Try again.");
}
