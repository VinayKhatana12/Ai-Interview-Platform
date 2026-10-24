// Database health check. Verifies connectivity through the same PrismaClient
// + PrismaPg adapter the API will use, then reports the public schema's
// tables, foreign keys and enums. Prints host/database names and latency —
// never the password.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

try {
  const start = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const latencyMs = Math.round(performance.now() - start);

  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name`;

  const [{ n: fkCount }] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;

  const enums = await prisma.$queryRaw`
    SELECT t.typname AS name, count(e.enumlabel)::int AS values
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname ORDER BY t.typname`;

  const shown = new URL(url);
  console.log(`database: ok (${latencyMs} ms round trip)`);
  console.log(`host: ${shown.host}  database: ${decodeURIComponent(shown.pathname.slice(1))}`);
  console.log(`tables: ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`foreign keys: ${fkCount}`);
  console.log(`enums: ${enums.map((e) => `${e.name} (${e.values} values)`).join(", ") || "none"}`);
  process.exit(0);
} catch (err) {
  console.error(`database: FAILED — ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
