// OpenAI text-to-speech (gpt-4o-mini-tts, voice marin), server-only.
// Alternative provider; the app prefers the free Gemini key (see
// ttsProvider.js). NOTE: OpenAI deprecates gpt-4o-mini-tts on 2027-01-06 —
// the model is env-configurable (TTS_MODEL) for that swap.
import OpenAI from "openai";
import { HttpError } from "../../utils/HttpError.js";

const VOICE = process.env.TTS_VOICE || "marin";
const TTS_TIMEOUT_MS = 60_000;

let client = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "TTS_NOT_CONFIGURED",
      "AI voice is not configured on this server. Add AI_API_KEY or OPENAI_API_KEY to server/.env.",
    );
  }
  client ??= new OpenAI({ apiKey, timeout: TTS_TIMEOUT_MS, maxRetries: 2 });
  return client;
}

export async function openaiGenerateSpeech(text) {
  const openai = getClient();
  try {
    const response = await openai.audio.speech.create({
      model: process.env.TTS_MODEL || "gpt-4o-mini-tts",
      voice: VOICE,
      input: text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new HttpError(502, "TTS_PROVIDER_FAILED", "The voice service returned no audio. Try again.");
    }
    return { buffer, mimeType: "audio/mpeg", source: "openai" };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const status = err?.status;
    console.error(`[tts:openai] provider failure: ${err?.constructor?.name ?? "Error"} status=${status ?? "n/a"}`);
    if (err?.name === "APIConnectionTimeoutError" || err?.name === "TimeoutError") {
      throw new HttpError(504, "TTS_TIMEOUT", "Generating the voice took too long. Try again.");
    }
    if (err?.name === "APIConnectionError") {
      throw new HttpError(503, "TTS_UNREACHABLE", "Could not reach the voice service. Try again.");
    }
    if (status === 429) {
      if (err?.error?.type === "insufficient_quota") {
        throw new HttpError(
          402,
          "TTS_NO_CREDITS",
          "The voice service has no OpenAI credits left. Add billing credits or rely on the configured free provider.",
        );
      }
      throw new HttpError(429, "TTS_RATE_LIMITED", "The voice service is busy. Wait a moment and try again.");
    }
    if (status === 400 || status === 422) {
      throw new HttpError(422, "TTS_INVALID_TEXT", "This question could not be spoken. Try the browser voice.");
    }
    throw new HttpError(502, "TTS_PROVIDER_FAILED", "Generating the voice failed on the provider side. Try again.");
  }
}
