// Transcription service: ownership + session-state rules around the
// provider call. Stateless by design (no audio or transcript is persisted in
// Phase 2.2); duplicate calls simply re-run and are guarded client-side.
import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";
import { isAllowedAudioType } from "./ai/audioFormats.js";
import { transcribeAudio } from "./ai/sttProvider.js";

const MIN_AUDIO_BYTES = 1024; // smaller than this is not a real recording

// Same grace the answer endpoint applies; a candidate cannot transcribe for
// an expired interview either.
const SUBMIT_GRACE_MS = 60_000;

export async function transcribeInterviewAudio(userId, interviewId, file) {
  const interview = await prisma.interview.findFirst({ where: { id: interviewId, userId } });
  if (!interview) throw new HttpError(404, "NOT_FOUND", "Interview not found.");

  if (interview.status === "PENDING") {
    throw new HttpError(409, "NOT_STARTED", "Start the interview before transcribing answers.");
  }
  if (interview.status === "COMPLETED") {
    throw new HttpError(409, "ALREADY_COMPLETED", "This interview is already completed.");
  }
  const deadline = interview.startedAt.getTime() + interview.durationMinutes * 60_000 + SUBMIT_GRACE_MS;
  if (Date.now() > deadline) {
    throw new HttpError(409, "TIME_EXPIRED", "Time is up for this interview.");
  }

  if (!file) {
    throw new HttpError(422, "NO_AUDIO", "Attach the audio recording to transcribe.");
  }
  if (file.size < MIN_AUDIO_BYTES) {
    throw new HttpError(422, "EMPTY_AUDIO", "The recording is empty. Record your answer and try again.");
  }
  if (!isAllowedAudioType(file.mimetype)) {
    throw new HttpError(
      422,
      "UNSUPPORTED_AUDIO_TYPE",
      "Unsupported audio format. Record with the in-app recorder (WebM, MP4 or OGG).",
    );
  }

  // File exists only in memory for this request; never written to disk.
  const transcript = await transcribeAudio({ buffer: file.buffer, mimeType: file.mimetype });
  return { transcript };
}
