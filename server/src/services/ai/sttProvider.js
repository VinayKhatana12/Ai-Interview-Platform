// Speech-to-text provider selection. The free Gemini key (AI_API_KEY)
// already in use for questions/evaluation is the primary transcriber;
// OpenAI (OPENAI_API_KEY) remains a drop-in alternative. Both implement
// transcribeAudio({ buffer, mimeType }) -> transcript string.
import { HttpError } from "../../utils/HttpError.js";
import { transcribeAudio as openaiTranscribe } from "./openaiTranscription.js";
import { geminiTranscribeAudio } from "./geminiTranscription.js";

export function transcriptionProviderName() {
  if (process.env.AI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function isTranscriptionConfigured() {
  return transcriptionProviderName() !== null;
}

export async function transcribeAudio(payload) {
  const provider = transcriptionProviderName();
  if (provider === "gemini") return geminiTranscribeAudio(payload);
  if (provider === "openai") return openaiTranscribe(payload);
  throw new HttpError(
    503,
    "STT_NOT_CONFIGURED",
    "Transcription is not configured on this server. Add AI_API_KEY or OPENAI_API_KEY to server/.env.",
  );
}
