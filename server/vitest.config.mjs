import { defineConfig } from "vitest/config";
import "dotenv/config";

// Tests run against ai_interview_test, never the dev database.
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.pathname = "/ai_interview_test";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    // Test files share one database; wipe-based isolation needs them serial.
    fileParallelism: false,
    env: {
      DATABASE_URL: testUrl.href,
      // Deterministic across machines; .env's secret is used when present.
      JWT_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      NODE_ENV: "test",
      // Hermetic: a developer's real AI_API_KEY from .env must never leak
      // into tests (dotenv loads .env at config time). ai.test.mjs sets its
      // own key per test; every other file runs the deterministic fixture.
      AI_API_KEY: "",
    },
  },
});
