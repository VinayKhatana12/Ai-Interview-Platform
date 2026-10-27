// Interview configuration validation. The allowed catalogs live here so the
// client and the AI generator (M6) share one source of truth.
import { z } from "zod";

export const EXPERIENCE_LEVELS = ["0-1", "1-3", "3-5", "5+"];

export const TOPICS = [
  "JavaScript",
  "React",
  "Node.js",
  "TypeScript",
  "Data Structures & Algorithms",
  "DBMS",
  "System Design",
  "Operating Systems",
  "Networks",
  "OOP",
];

export const createInterviewSchema = z.strictObject({
    roleTitle: z
      .string()
      .trim()
      .min(2, "Role title must be at least 2 characters")
      .max(80, "Role title must be at most 80 characters"),
    experienceLevel: z.enum(EXPERIENCE_LEVELS, "Choose an experience level"),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"], "Choose a difficulty"),
    // Technical, behavioral, or a mix — drives the generator.
    interviewType: z
      .enum(["TECHNICAL", "BEHAVIORAL", "MIXED"], "Choose an interview type")
      .default("TECHNICAL"),
    // Catalog topics plus the candidate's own custom topics, normalized:
    // trimmed, 2-40 chars each, deduplicated case-insensitively, max five.
    topics: z
      .array(z.string().trim().min(2, "Topics need at least 2 characters").max(40, "Topics are limited to 40 characters"))
      .min(1, "Pick at least one topic")
      .max(5, "Pick at most five topics")
      .transform((list) => [...new Map(list.map((t) => [t.toLowerCase(), t])).values()]),
    // Delivery mode. VOICE opens the session in the voice workspace; answers
    // are transcribed and reviewed before submission.
    mode: z.enum(["TEXT", "VOICE"], "Choose a mode").default("TEXT"),
    questionCount: z.coerce
      .number()
      .int("Question count must be a whole number")
      .min(3, "At least 3 questions")
      .max(15, "At most 15 questions"),
    durationMinutes: z.coerce
      .number()
      .int("Duration must be a whole number of minutes")
      .min(10, "At least 10 minutes")
      .max(90, "At most 90 minutes")
      .refine((v) => v % 5 === 0, "Duration must be a multiple of 5 minutes"),
    // userId is deliberately absent: the owner always comes from the session.
});

export const listInterviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
  // History filters, all optional. Role is a substring match on roleTitle.
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// GET /:id/compare?with=<otherId>. `with` is required and bounded — a raw
// req.query value could be an array (repeated params) and would reach
// Prisma unvalidated.
export const compareQuerySchema = z.object({
  with: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid interview id"),
});

export const updateMeSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be at most 80 characters")
      .regex(
        /^[\p{L}][\p{L}\s'.-]*$/u,
        "Name can contain letters, spaces, apostrophes, hyphens and periods",
      )
      .optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS, "Choose an experience level").nullable().optional(),
  });
