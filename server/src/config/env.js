// Fails fast on missing/invalid environment configuration.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "is required (see .env.example)"),
  JWT_SECRET: z
    .string()
    .min(
      32,
      "must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    ),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // AI provider (Google Gemini). Without AI_API_KEY the platform runs on the
  // labeled development fixtures; with it, every generation/evaluation call
  // goes to the real provider. The key never leaves this process. An empty
  // value counts as unset (a blank line in .env must not crash startup).
  AI_PROVIDER: z.enum(["gemini", "none"]).default("gemini"),
  AI_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // The lite tier answers in ~1-3s; the thinking models take 40s+ per call
  // (measured 2026-10) and are unusable for per-question workloads. The
  // "-latest" alias tracks Google's current lite model, avoiding the
  // new-user deprecation that retired the 2.5 line.
  AI_MODEL: z.string().min(1).default("gemini-flash-lite-latest"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // Speech-to-text (OpenAI gpt-transcribe). Without OPENAI_API_KEY the
  // transcribe endpoint answers 503 STT_NOT_CONFIGURED; empty counts as unset.
  // Adaptive follow-ups: max follow-up questions per original planned
  // question (0 disables follow-ups entirely).
  FOLLOWUP_MAX_PER_QUESTION: z.coerce.number().int().min(0).max(5).default(2),
  OPENAI_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Cross-origin deployments only. Comma-separated absolute origins — a
  // wildcard is rejected outright because the session cookie is sent with
  // credentials. Unset (the default) means same-origin only: no CORS headers
  // at all, which is correct for the Vite-proxy dev setup and same-site
  // production deployments.
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((o) => o.trim()).filter(Boolean) : null))
    .refine(
      (list) =>
        list === null ||
        (list.length > 0 &&
          list.every((o) => /^https?:\/\//.test(o) && !o.includes("*"))),
      "must be comma-separated absolute origins (no wildcards)",
    ),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "env"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// Production must know it is about to serve labeled development fixtures —
// that is a legitimate mode, but only when chosen deliberately.
if (env.NODE_ENV === "production" && !env.AI_API_KEY) {
  console.warn(
    "[env] AI_API_KEY is not set: the API will serve labeled development fixture questions/evaluations.",
  );
}
