// Phase-1 verification dump: foreign keys, unique constraints, indexes.
// Read-only; prints a compact summary. Deleted after the audit.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const fks = await prisma.$queryRaw`
  SELECT conname, conrelid::regclass::text AS table_name, confdeltype AS on_delete
  FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
  ORDER BY 2, 1`;
const uniques = await prisma.$queryRaw`
  SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE contype='u' AND connamespace='public'::regnamespace
  ORDER BY 2, 1`;
const idx = await prisma.$queryRaw`
  SELECT tablename, indexname FROM pg_indexes
  WHERE schemaname='public' AND tablename IN ('users','interviews','questions','answers','evaluations')
  ORDER BY 1, 2`;
const migrations = await prisma.$queryRaw`
  SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name`;

console.log("MIGRATIONS APPLIED:");
migrations.forEach((m) => console.log(`  ${m.migration_name}`));
console.log("FOREIGN KEYS (on_delete a=no action, c=cascade):");
fks.forEach((f) => console.log(`  ${f.table_name}: ${f.conname} (on_delete=${f.on_delete})`));
console.log("UNIQUE CONSTRAINTS:");
uniques.forEach((u) => console.log(`  ${u.table_name}: ${u.def}`));
console.log(`INDEXES (${idx.length}):`);
idx.forEach((i) => console.log(`  ${i.tablename}: ${i.indexname}`));

await prisma.$disconnect();
