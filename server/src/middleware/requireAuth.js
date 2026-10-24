// Guards private endpoints: requires a valid session cookie and an account
// that still exists. Attaches the safe user shape to req.user.
import { SESSION_COOKIE, } from "../lib/cookies.js";
import { verifySession } from "../lib/jwt.js";
import { findSafeUserById } from "../services/auth.service.js";
import { HttpError } from "../utils/HttpError.js";

function unauthenticated(message) {
  return new HttpError(401, "UNAUTHENTICATED", message);
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return next(unauthenticated("Sign in to continue."));
  }

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    return next(unauthenticated("Your session expired. Sign in again."));
  }

  try {
    const user = await findSafeUserById(payload.sub);
    if (!user) {
      return next(unauthenticated("Your session is no longer valid. Sign in again."));
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
