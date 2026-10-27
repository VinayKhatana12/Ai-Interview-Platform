// Session tokens: short-lived signed JWTs delivered only in an HttpOnly cookie.
// The token never touches localStorage; the browser can't read it and neither
// can any script on the page.
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const ISSUER = "ai-interview-platform";

// 7 days: matches the cookie's max-age. Short enough to expire, long enough
// that a daily-use practice app doesn't sign people out mid-week. When we add
// refresh-token rotation later this becomes 15 minutes.
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
    issuer: ISSUER,
  });
}

export function verifySession(token) {
  // algorithms pinned: the token is always HMAC-SHA256; the pin removes any
  // algorithm-confusion surface regardless of what a forged header claims.
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ["HS256"] });
}
