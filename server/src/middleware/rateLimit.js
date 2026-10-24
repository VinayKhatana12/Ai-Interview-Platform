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
