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

// Adaptive follow-up decision: warranted flag plus the follow-up text when
// warranted. topic/questionType are derived from the parent question.
export const followUpDecisionSchema = z
  .object({
    warranted: z.boolean(),
    questionText: z.string().trim().max(1000).optional().default(''),
  })
  .refine((d) => !d.warranted || d.questionText.length >= 10, {
    message: 'A warranted follow-up needs question text',
    path: ['questionText'],
  });

export function geminiFollowUpSchema() {
  return {
    type: 'object',
    properties: {
      warranted: { type: 'boolean' },
      questionText: { type: 'string' },
    },
    required: ['warranted', 'questionText'],
  };
}

// Whole-interview feedback report. Evidence strings are mandatory so the
// candidate can check every claim against their own answers.
export const interviewFeedbackSchema = z.object({
  summary: z.string().trim().min(30).max(2000),
  strengths: z.array(z.object({ point: z.string().trim().min(5).max(300), evidence: z.string().trim().min(10).max(500) })).min(1).max(4),
  improvements: z.array(z.object({ point: z.string().trim().min(5).max(300), evidence: z.string().trim().min(10).max(500) })).min(1).max(4),
  skillNotes: z.array(z.object({
    topic: z.string().trim().min(2).max(60),
    assessment: z.string().trim().min(10).max(600),
    evidence: z.string().trim().min(10).max(500),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  })).min(1).max(6),
  plan: z.array(z.object({
    topic: z.string().trim().min(2).max(60),
    why: z.string().trim().min(10).max(500),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    exercise: z.string().trim().min(10).max(600),
    doneWhen: z.string().trim().min(10).max(300),
    sequence: z.coerce.number().int().min(1).max(10),
  })).min(2).max(4),
});

export function geminiInterviewFeedbackSchema() {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      strengths: { type: "array", items: { type: "object", properties: { point: { type: "string" }, evidence: { type: "string" } }, required: ["point", "evidence"] } },
      improvements: { type: "array", items: { type: "object", properties: { point: { type: "string" }, evidence: { type: "string" } }, required: ["point", "evidence"] } },
      skillNotes: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, assessment: { type: "string" }, evidence: { type: "string" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] } }, required: ["topic", "assessment", "evidence", "confidence"] } },
      plan: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, why: { type: "string" }, priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, exercise: { type: "string" }, doneWhen: { type: "string" }, sequence: { type: "number" } }, required: ["topic", "why", "priority", "exercise", "doneWhen", "sequence"] } },
    },
    required: ["summary", "strengths", "improvements", "skillNotes", "plan"],
  };
}