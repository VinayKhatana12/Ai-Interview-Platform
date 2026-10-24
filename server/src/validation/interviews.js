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
    topics: z
      .array(z.enum(TOPICS))
      .min(1, "Pick at least one topic")
      .max(5, "Pick at most five topics"),
    // Text interviews only for now; other modes stay explicitly out of range.
    mode: z.literal("TEXT", "Text is the only available mode"),
    questionCount: z.coerce
      .number()
      .int("Question count must be a whole number")
      .min(3, "At least 3 questions")
      .max(10, "At most 10 questions"),
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
