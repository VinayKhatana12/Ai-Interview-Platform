// Provider-agnostic question generation interface.
//
// With AI_API_KEY configured, questions come from the real provider and are
// schema-validated before they touch the database. Without a key (local
// development), the clearly-labeled development fixture keeps the engine
// usable — the session UI labels fixture sets as development content.
//
// On provider failure this throws; it never silently substitutes the
// fixture, so a configured deployment can never mistake fixture questions
// for generated ones.
import { fixtureQuestions } from "./questionFixture.js";
import { aiGenerateQuestions } from "./ai/provider.js";

export function isAiConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

export async function generateQuestions(config) {
  if (isAiConfigured()) {
    // Throws AiError on transient/invalid responses; start maps that to a
    // recoverable 503 and the interview stays PENDING for a clean retry.
    return aiGenerateQuestions(config);
  }
  // DEVELOPMENT FIXTURE (no AI_API_KEY configured).
  return fixtureQuestions(config);
}
