import { HttpError } from "../utils/HttpError.js";

export function notFound(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}

// Last middleware in the chain. Known HttpErrors keep their shape; anything
// else is logged server-side and returned as a generic 500 so internals
// (stack traces, Prisma errors) never reach the client.
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

  // Malformed JSON bodies arrive here from express.json().
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "BAD_JSON", message: "The request body must be valid JSON." },
    });
  }

  console.error("[unhandled error]", err);
  return res.status(500).json({
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  });
}
