// Question speech: ownership + trusted-source rules around the TTS call.
// The spoken text ALWAYS comes from the database (the interview's own
// question), never from client-supplied text, so the endpoint cannot be
// used as an open speech-generation service.
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";
import { generateSpeech } from "./ai/ttsProvider.js";

const MAX_TTS_CHARS = 4096; // provider input ceiling, enforced before any call

export const speechRequestSchema = z.strictObject({
  questionId: z.string().uuid("Unknown question"),
});

export async function generateQuestionSpeech(userId, interviewId, { questionId }) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw new HttpError(404, "NOT_FOUND", "Interview not found.");

  if (interview.status === "PENDING") {
    throw new HttpError(409, "NOT_STARTED", "Start the interview first.");
  }
  if (interview.status === "COMPLETED") {
    throw new HttpError(409, "ALREADY_COMPLETED", "This interview is already completed.");
  }

  // Trusted source: the question must belong to this interview.
  const question = await prisma.question.findFirst({
    where: { id: questionId, interviewId },
    select: { text: true },
  });
  if (!question) throw new HttpError(404, "NOT_FOUND", "Question not found.");

  if (question.text.length > MAX_TTS_CHARS) {
    throw new HttpError(422, "QUESTION_TOO_LONG", "This question is too long to speak.");
  }

  // Stateless: audio is generated per request and never stored.
  return generateSpeech(question.text);
}
