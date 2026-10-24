import rateLimit from "express-rate-limit";

export function jsonErrorEnvelope(status, code, message) {
  return (req, res) => {
    res.status(status).json({ error: { code, message } });
  };
}

// Covers register + login: brute-force protection for credential endpoints.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonErrorEnvelope(429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes and try again."),
});
