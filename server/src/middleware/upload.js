// Bounded in-memory upload handling for transcription requests. Nothing is
// written to disk; the buffer lives only for the duration of the request and
// is never logged.
import multer from "multer";

export const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB, provider limit

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_AUDIO_UPLOAD_BYTES,
    fields: 4,
    fieldSize: 1024,
  },
});
