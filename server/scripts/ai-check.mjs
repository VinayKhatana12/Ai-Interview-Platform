// One cheap live call against the configured AI provider: verifies the key
// and model without running an interview. Costs a fraction of a cent on the
// free tier; the test suite never calls the real provider (it is mocked).
import "dotenv/config";
import { env } from "../src/config/env.js";
import { generateJson } from "../src/services/ai/geminiClient.js";

if (!env.AI_API_KEY) {
  console.error("AI_API_KEY is not set in server/.env — nothing to check.");
  console.error("The app is running on the labeled development fixtures.");
  process.exit(1);
}

console.log(`Provider: ${env.AI_PROVIDER} · Model: ${env.AI_MODEL}`);
try {
  const out = await generateJson({
    prompt: 'Respond as JSON: {"ok": true} if you can read this.',
    system: "You respond with a single JSON object only.",
    responseSchema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    },
    maxOutputTokens: 64,
  });
  if (out?.ok === true) {
    console.log("Provider reachable and responding with JSON. Key works.");
    process.exit(0);
  }
  console.error("Provider responded, but not in the expected shape:", out);
  process.exit(1);
} catch (err) {
  console.error(`Provider check failed: ${err.code ?? "ERROR"} — ${err.message}`);
  process.exit(1);
}
