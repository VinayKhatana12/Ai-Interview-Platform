// Provider facade: the one module the rest of the server uses for AI work.
// Today it speaks Gemini through geminiClient; another provider means one
// more client module and a branch here — nothing else changes.
//
// Every return value is validated here (provider structured output + zod),
// so callers receive typed, bounded data or a typed AiError.
import { AiError, generateJson } from "./geminiClient.js";
import { buildEvaluationPrompt, buildQuestionPrompt } from "./prompts.js";
import {
  evaluationSchema,
  geminiEvaluationSchema,
  geminiQuestionSchema,
  questionSetSchema,
} from "./schemas.js";

export function isAiConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

export async function aiGenerateQuestions(config) {
  const { system, user } = buildQuestionPrompt(config);
  const raw = await generateJson({
    prompt: user,
    system,
    responseSchema: geminiQuestionSchema(),
    // ~150 tokens per question plus envelope; enough for 10 questions.
    maxOutputTokens: Math.min(8192, 512 + config.questionCount * 320),
  });

  const parsed = questionSetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiError("AI_INVALID_SHAPE", "The AI response did not match the question schema.");
  }
  const questions = parsed.data.questions;

  // The engine's contract: exactly the configured count, topics from the
  // interview's own catalog. Mismatches are provider errors, not silently
  // trimmed or padded sets.
  if (questions.length !== config.questionCount) {
    throw new AiError(
      "AI_INVALID_SHAPE",
      `Expected ${config.questionCount} questions, received ${questions.length}.`,
    );
  }
  const allowed = new Set(config.topics.map((t) => t.toLowerCase()));
  for (const q of questions) {
    if (!allowed.has(q.topic.toLowerCase())) {
      throw new AiError("AI_INVALID_SHAPE", `The AI returned a question outside the chosen topics (${q.topic}).`);
    }
  }

  // Near-duplicate guard: a set that asks one idea twice is a bad set, so
  // the whole generation is rejected and the start can be retried. Word-set
  // Jaccard over the normalized text catches reworded repeats; containment
  // catches a short variant of another question.
  const normalized = questions.map((q) =>
    q.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(),
  );
  const wordSets = normalized.map((t) => new Set(t.split(" ").filter((w) => w.length > 2)));
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (normalized[i] === normalized[j]) {
        throw new AiError("AI_INVALID_SHAPE", "The AI returned the same question twice.");
      }
      const a = wordSets[i];
      const b = wordSets[j];
      let shared = 0;
      for (const w of a) if (b.has(w)) shared += 1;
      const similarity = shared / (a.size + b.size - shared); // Jaccard
      const contained =
        a.size >= 4 &&
        b.size >= 4 &&
        (normalized[i].includes(normalized[j]) || normalized[j].includes(normalized[i]));
      if (similarity > 0.6 || contained) {
        throw new AiError("AI_INVALID_SHAPE", "The AI returned near-duplicate questions.");
      }
    }
  }
  return questions;
}

export async function aiEvaluateAnswer(ctx) {
  const { system, user } = buildEvaluationPrompt(ctx);
  const raw = await generateJson({
    prompt: user,
    system,
    responseSchema: geminiEvaluationSchema(),
    maxOutputTokens: 2048,
  });

  const parsed = evaluationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiError("AI_INVALID_SHAPE", "The AI response did not match the evaluation schema.");
  }
  return parsed.data;
}

export { AiError };
