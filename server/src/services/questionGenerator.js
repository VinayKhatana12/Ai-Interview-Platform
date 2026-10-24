// Provider-agnostic question generation interface.
//
// The interview engine calls only generateQuestions(); the implementation is
// the development fixture today. The AI milestone replaces the call below
// with a real provider request (same input config, same output contract) and
// nothing else in the session code changes.
//
// Output contract: [{ text, topic, difficulty, questionType }] — questions
// only. Model answers and scoring never travel through this interface; they
// belong to the evaluation provider of the next milestone.
import { fixtureQuestions } from "./questionFixture.js";

export async function generateQuestions(config) {
  // DEVELOPMENT FIXTURE — replaced by the LLM provider in the AI milestone.
  return fixtureQuestions(config);
}
