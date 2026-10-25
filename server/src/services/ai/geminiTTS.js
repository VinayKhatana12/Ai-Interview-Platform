// Google Gemini text-to-speech (gemini-3.8-flash-tts), server-only, using
// the same free-tier AI_API_KEY as the rest of the app. Verified live: this
// model returns audio/wav inline data. Defensive: if a future model returns
// raw PCM (audio/L16), it is wrapped into a WAV container here.
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/HttpError.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = process.env.TTS_GEMINI_MODEL || "gemini-3.8-flash-tts";
const VOICE = process.env.TTS_GEMINI_VOICE || "Kore";
const RETRY_DELAYS_MS = [1500, 3000, 5000];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Minimal 44-byte WAV header for mono 16-bit PCM (Gemini's default is 24kHz).
function wrapPcmInWav(pcm, rate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function geminiGenerateSpeech(text) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "TTS_NOT_CONFIGURED",
      "AI voice is not configured on this server. Add AI_API_KEY or OPENAI_API_KEY to server/.env.",
    );
  }

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `Read this interview question aloud exactly as written:\n${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  });

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal },
      );

      if (res.ok) {
        const data = await res.json();
        const inline = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
        const bytes = inline?.data ? Buffer.from(inline.data, "base64") : null;
        if (!bytes || bytes.length === 0) {
          throw new HttpError(502, "TTS_PROVIDER_FAILED", "The voice service returned no audio. Try again.");
        }
        const mime = (inline.mimeType ?? "").toLowerCase();
        if (mime.startsWith("audio/l16") || mime.startsWith("audio/pcm")) {
          const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
          return { buffer: wrapPcmInWav(bytes, rate), mimeType: "audio/wav", source: "gemini" };
        }
        return { buffer: bytes, mimeType: mime.startsWith("audio/") ? mime : "audio/wav", source: "gemini" };
      }

      const status = res.status;
      if (!RETRYABLE_STATUS.has(status)) {
        if (status === 400 || status === 422) {
          console.error(`[tts:gemini] provider rejected text: status=${status}`);
          throw new HttpError(422, "TTS_INVALID_TEXT", "This question could not be spoken. Try the browser voice.");
        }
        console.error(`[tts:gemini] provider error status=${status}`);
        throw new HttpError(502, "TTS_PROVIDER_FAILED", "Generating the voice failed on the provider side. Try again.");
      }

      console.error(`[tts:gemini] transient status=${status}, attempt ${attempt + 1}`);
      lastError =
        status === 429
          ? new HttpError(429, "TTS_RATE_LIMITED", "The voice service is busy. Wait a moment and try again.")
          : new HttpError(503, "TTS_PROVIDER_FAILED", "Generating the voice failed on the provider side. Try again.");
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 503) {
          lastError = err;
          if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw err;
      }
      if (err.name === "AbortError") {
        lastError = new HttpError(504, "TTS_TIMEOUT", "Generating the voice took too long. Try again.");
      } else {
        console.error(`[tts:gemini] network failure: ${err?.constructor?.name ?? "Error"}`);
        lastError = new HttpError(503, "TTS_UNREACHABLE", "Could not reach the voice service. Try again.");
      }
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new HttpError(503, "TTS_PROVIDER_FAILED", "Generating the voice failed on the provider side. Try again.");
}
