// Prepares a dedicated test database: creates ai_interview_test if missing
// and applies all committed migrations. Never touches the dev database.
import "dotenv/config";
import pg from "pg";
import { execSync } from "node:child_process";

const devUrl = process.env.DATABASE_URL;
if (!devUrl) {
  console.error("DATABASE_URL is not set in server/.env.");
  process.exit(1);
}

export const TEST_DB = "ai_interview_test";

const url = new URL(devUrl);
const testUrl = new URL(devUrl);
testUrl.pathname = `/${TEST_DB}`;

const admin = new pg.Client({ connectionString: new URL(`/postgres`, url).href });
await admin.connect();
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
if (rowCount === 0) {
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  console.log(`Created test database "${TEST_DB}".`);
} else {
  console.log(`Test database "${TEST_DB}" already exists.`);
}
await admin.end();

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl.href },
});
console.log(`Test database schema is up to date.`);
