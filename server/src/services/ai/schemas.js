// Output contracts for provider responses. The provider's structured-output
// mode is the first gate; these schemas are the second. Nothing the model
// returns reaches the database before passing both.
import { z } from "zod";

export const questionSetSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(10).max(1000),
        topic: z.string().trim().min(2).max(60),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
        questionType: z.enum(["technical", "behavioral"]),
      }),
    )
    .min(1)
    .max(10),
});

export const evaluationSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  correctness: z.enum(["CORRECT", "PARTIALLY_CORRECT", "INCORRECT"]),
  feedback: z.string().trim().min(1).max(1500),
  // Empty lists are legitimate: a fully incorrect answer can have no
  // strengths. Measured live against the real model (2026-10).
  strengths: z.array(z.string().trim().min(1).max(200)).max(4),
  improvements: z.array(z.string().trim().min(1).max(200)).max(4),
  modelAnswer: z.string().trim().min(1).max(1500),
});

// Gemini's responseSchema: a subset of OpenAPI schema. Field order and
// "propertyOrdering" keep the model's JSON well-formed.
export function geminiQuestionSchema() {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            topic: { type: "string" },
            difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
            questionType: { type: "string", enum: ["technical", "behavioral"] },
          },
          required: ["text", "topic", "difficulty", "questionType"],
        },
      },
    },
    required: ["questions"],
  };
}

export function geminiEvaluationSchema() {
  return {
    type: "object",
    properties: {
      score: { type: "number" },
      correctness: { type: "string", enum: ["CORRECT", "PARTIALLY_CORRECT", "INCORRECT"] },
      feedback: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      improvements: { type: "array", items: { type: "string" } },
      modelAnswer: { type: "string" },
    },
    required: ["score", "correctness", "feedback", "strengths", "improvements", "modelAnswer"],
  };
}
