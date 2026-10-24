import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/HttpError.js";
import { SAFE_USER_SELECT } from "./userSelect.js";

const BCRYPT_ROUNDS = 10;

// Compared against when the email doesn't exist, so "unknown email" and
// "wrong password" take the same time and leak nothing.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DGjOtYtT9GLPFcBzT4Z9G8SEfhmVy";

export async function registerUser({ name, email, password }) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(
      409,
      "EMAIL_IN_USE",
      "An account with this email already exists. Try signing in instead.",
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    return await prisma.user.create({
      data: { name, email, passwordHash, role: "CANDIDATE" },
      select: SAFE_USER_SELECT,
    });
  } catch (err) {
    // The unique index on users.email is the real guarantee; the pre-check
    // above just gives a friendlier common path.
    if (err?.code === "P2002") {
      throw new HttpError(
        409,
        "EMAIL_IN_USE",
        "An account with this email already exists. Try signing in instead.",
      );
    }
    throw err;
  }
}

// Returns the full user row (including passwordHash for the comparison only)
// or null. Callers must re-select with SAFE_USER_SELECT before responding.
export async function verifyCredentials({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function findSafeUserById(id) {
  return prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
}
