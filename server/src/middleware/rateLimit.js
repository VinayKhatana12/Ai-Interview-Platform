import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export function jsonErrorEnvelope(status, code, message) {
  return (req, res) => {
    res.status(status).json({ error: { code, message } });
  };
}

// Covers register + login: brute-force protection for credential endpoints.
// The suite signs in per-test against one IP, so tests raise the ceiling
// instead of bypassing the middleware.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonErrorEnvelope(429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes and try again."),
});

// Voice generation is a metered provider call; one burst of playback per
// session stays far under this, while runaway clients get cut off.
export const speechLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 100000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonErrorEnvelope(429, "RATE_LIMITED", "Too many voice requests. Wait a moment and try again."),
});

// Transcription is also a metered provider call (audio in, transcript out).
// The client transcribes once per recorded answer, so this ceiling is far
// above real use; it exists to stop runaway or abusive callers.
export const sttLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 100000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonErrorEnvelope(429, "RATE_LIMITED", "Too many transcription requests. Wait a moment and try again."),
});
