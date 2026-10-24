import { env } from "../config/env.js";
import { SESSION_TTL_SECONDS } from "./jwt.js";

export const SESSION_COOKIE = "session";

// HttpOnly + SameSite=Lax: JavaScript (ours or injected) cannot read the
// cookie, and browsers won't attach it to cross-site POST requests, which
// together with JSON-only bodies is our CSRF protection. `secure` is enabled
// in production where the app is served over HTTPS.
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}
