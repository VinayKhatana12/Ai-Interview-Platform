import { defineConfig } from "vitest/config";
import "dotenv/config";

// Tests run against ai_interview_test, never the dev database.
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.pathname = "/ai_interview_test";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    env: {
      DATABASE_URL: testUrl.href,
      // Deterministic across machines; .env's secret is used when present.
      JWT_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      NODE_ENV: "test",
    },
  },
});
