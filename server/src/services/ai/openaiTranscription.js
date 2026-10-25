// OpenAI speech-to-text (gpt-transcribe), server-only.
//
// Reads OPENAI_API_KEY at call time (absent/empty -> typed 503). All errors
// map to stable codes with client-safe messages; provider details and audio
// content are logged only as codes, never as content or stack traces.
import OpenAI, { toFile } from "openai";
import { HttpError } from "../../utils/HttpError.js";

const MODEL = "gpt-transcribe";
const STT_TIMEOUT_MS = 60_000;
const STT_MAX_RETRIES = 2; // SDK retries 429/5xx internally

let client = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "STT_NOT_CONFIGURED",
      "Transcription is not configured on this server. Add OPENAI_API_KEY to server/.env.",
    );
  }
  client ??= new OpenAI({ apiKey, timeout: STT_TIMEOUT_MS, maxRetries: STT_MAX_RETRIES });
  return client;
}

export function isTranscriptionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Accepts the browser MediaRecorder formats the platform records (webm/opus,
// mp4, ogg) plus the provider's other supported types.
const ALLOWED_PREFIXES = [
  "audio/webm",
  "video/webm", // some engines label webm recordings this way
  "audio/mp4",
  "video/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/mpga",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/x-matroska",
];

export function isAllowedAudioType(mimeType) {
  const base = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return ALLOWED_PREFIXES.includes(base);
}

export async function transcribeAudio({ buffer, mimeType }) {
  const openai = getClient();

  let result;
  try {
    const file = await toFile(buffer, "recording", { type: mimeType || "audio/webm" });
    result = await openai.audio.transcriptions.create({
      file,
      model: MODEL,
    });
  } catch (err) {
    const status = err?.status;
    // Log the failure class only — never transcript or audio details.
    console.error(`[stt] provider failure: ${err?.constructor?.name ?? "Error"} status=${status ?? "n/a"}`);
    if (err?.code === "request timed out" || err?.name === "APIConnectionTimeoutError" || err?.name === "TimeoutError") {
      throw new HttpError(504, "STT_TIMEOUT", "Transcription took too long. Try again.");
    }
    if (err?.name === "APIConnectionError") {
      throw new HttpError(503, "STT_UNREACHABLE", "Could not reach the transcription service. Try again.");
    }
    if (status === 429) {
      throw new HttpError(429, "STT_RATE_LIMITED", "The transcription service is busy. Wait a moment and try again.");
    }
    if (status === 400 || status === 422) {
      // The provider rejected the audio itself (corrupt/unsupported payload).
      throw new HttpError(422, "STT_INVALID_AUDIO", "The recording could not be transcribed. Try recording again.");
    }
    throw new HttpError(502, "STT_PROVIDER_FAILED", "Transcription failed on the provider side. Try again.");
  }

  const transcript = typeof result?.text === "string" ? result.text.trim() : "";
  if (!transcript) {
    throw new HttpError(422, "EMPTY_TRANSCRIPT", "No speech was detected in the recording. Try recording again.");
  }
  return transcript;
}
