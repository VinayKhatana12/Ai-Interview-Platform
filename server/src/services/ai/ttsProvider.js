// Text-to-speech provider selection, mirroring sttProvider: the free Gemini
// key (AI_API_KEY) is primary; OpenAI (OPENAI_API_KEY, gpt-4o-mini-tts with
// the marin voice) is the alternative. Both return { buffer, mimeType,
// source } for a binary response.
import { HttpError } from "../../utils/HttpError.js";
import { geminiGenerateSpeech } from "./geminiTTS.js";
import { openaiGenerateSpeech } from "./openaiTTS.js";

export function ttsProviderName() {
  if (process.env.AI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function generateSpeech(text) {
  if (ttsProviderName() === "gemini") return geminiGenerateSpeech(text);
  if (ttsProviderName() === "openai") return openaiGenerateSpeech(text);
  throw new HttpError(
    503,
    "TTS_NOT_CONFIGURED",
    "AI voice is not configured on this server. Add AI_API_KEY or OPENAI_API_KEY to server/.env.",
  );
}
