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
