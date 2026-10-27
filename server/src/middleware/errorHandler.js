import { HttpError } from "../utils/HttpError.js";

export function notFound(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}

// Last middleware in the chain. Known HttpErrors keep their shape; multer's
// upload errors map into the envelope; anything else is logged server-side
// and returned as a generic 500 so internals (stack traces, Prisma/provider
// errors) never reach the client.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Bounded multipart upload failures (size/field limits, non-multipart body).
  if (err?.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: { code: "AUDIO_TOO_LARGE", message: "The recording exceeds the 25 MB limit. Record a shorter answer." },
      });
    }
    return res.status(400).json({
      error: { code: "BAD_UPLOAD", message: "The upload was not a valid audio recording request." },
    });
  }

  // Malformed JSON bodies arrive here from express.json().
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "BAD_JSON", message: "The request body must be valid JSON." },
    });
  }

  // Structured single-line log: correlation id, request shape and the error
  // itself. Bodies, headers and cookies are never logged — they carry user
  // answers and credentials.
  const log = JSON.stringify({
    level: "error",
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    error: err?.code ?? err?.name ?? "UNKNOWN",
    message: err?.message,
    stack: err?.stack,
  });
  console.error(log);
  return res.status(500).json({
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  });
}
