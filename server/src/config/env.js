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
