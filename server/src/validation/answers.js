import { z } from "zod";

// Strict: no questionOrder, no status, no timing fields from the client.
// The server decides what is current; the client only says which question it
// believes it is answering and what it wrote.
export const submitAnswerSchema = z.strictObject({
  questionId: z.string().uuid("Unknown question"),
  responseText: z
    .string()
    .trim()
    .min(1, "Write an answer before submitting")
    .max(8000, "Answers are limited to 8,000 characters"),
});
