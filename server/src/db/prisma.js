// PrismaClient singleton for the API server.
// Prisma 7's prisma-client generator emits TypeScript; Node 22+ strips those
// types natively, so the .ts entry imports directly from plain JavaScript.
// The generator requires an explicit driver adapter; PrismaPg connects with
// the DATABASE_URL loaded from server/.env.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({ adapter });

// Reuse one client across dev-server restarts of hot-reloaded modules.
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
