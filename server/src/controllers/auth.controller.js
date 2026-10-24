import { clearSessionCookie, setSessionCookie } from "../lib/cookies.js";
import { signSession } from "../lib/jwt.js";
import { SAFE_USER_SELECT } from "../services/userSelect.js";
import { registerUser, verifyCredentials } from "../services/auth.service.js";
import { HttpError } from "../utils/HttpError.js";
import { prisma } from "../db/prisma.js";

// POST /api/auth/register — creates the account and signs the user in.
async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);
    setSessionCookie(res, signSession(user));
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login — one generic error for unknown email and wrong
// password alike, so the response can't be used to enumerate accounts.
async function login(req, res, next) {
  try {
    const user = await verifyCredentials(req.body);
    if (!user) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }
    const safeUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: SAFE_USER_SELECT,
    });
    setSessionCookie(res, signSession(safeUser));
    res.json({ user: safeUser });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout — idempotent: clearing an absent cookie is fine.
function logout(req, res) {
  clearSessionCookie(res);
  res.json({ ok: true });
}

// GET /api/auth/me — requireAuth attached the safe user shape.
function me(req, res) {
  res.json({ user: req.user });
}

export { register, login, logout, me };
