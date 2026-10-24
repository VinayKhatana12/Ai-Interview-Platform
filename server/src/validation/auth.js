// Zod schemas for auth input. The server is the authority; the client mirrors
// these rules only for instant feedback.
import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters")
    .regex(
      /^[\p{L}][\p{L}\s'.-]*$/u,
      "Name can contain letters, spaces, apostrophes, hyphens and periods",
    ),
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
