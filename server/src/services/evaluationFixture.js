// DEVELOPMENT-ONLY evaluation fixture (used when AI_API_KEY is absent).
//
// It exists so the results experience can be built and inspected locally
// without spending credits. It is a crude length/structure heuristic, it is
// labeled as development feedback everywhere it is shown, and it must never
// be mistaken for model output: every response it produces travels with
// feedbackSource: "fixture" from the evaluation service.
export function fixtureEvaluation(ctx) {
  const text = ctx.answerText.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasExample = /\bfor example\b|\be\.g\.|such as/i.test(text);
  const hasStructure = /\b(first|second|then|because|however|trade-?off|compared)\b/i.test(text);

  let score = 30;
  if (words >= 25) score += 15;
  if (words >= 60) score += 15;
  if (hasStructure) score += 15;
  if (hasExample) score += 10;
  score = Math.min(100, score);

  const correctness = score >= 75 ? "CORRECT" : score >= 45 ? "PARTIALLY_CORRECT" : "INCORRECT";

  const strengths = [];
  if (words >= 25) strengths.push("The answer has enough substance to assess.");
  if (hasStructure) strengths.push("Reasoning is structured with connectives.");
  if (hasExample) strengths.push("An example is given.");
  if (strengths.length === 0) strengths.push("The candidate attempted an answer.");

  const improvements = [];
  if (words < 25) improvements.push("Develop the answer further; a few words cannot show depth.");
  if (!hasExample) improvements.push("Anchor the explanation with a concrete example.");
  if (!hasStructure) improvements.push("Structure the reasoning in steps rather than one block.");
  if (improvements.length === 0) improvements.push("Tighten the explanation around the core idea.");

  return {
    score,
    correctness,
    feedback:
      "Development feedback from the local heuristic fixture, not an AI evaluation. It reacts mainly to answer length, structure words and examples. Configure AI_API_KEY to get real model feedback.",
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    modelAnswer:
      "Development fixture: model answers are available only with the AI provider configured.",
  };
}
