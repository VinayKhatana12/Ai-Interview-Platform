// Load server/.env before any module that reads process.env (config/env.js
// validates at import time).
import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown: stop accepting new requests, close in-flight ones, then
// release the database pool. The force-exit timer guarantees a hung
// connection (keep-alive socket, stuck query) can't block termination.
function shutdown(signal, exitCode = 0) {
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  const force = setTimeout(() => process.exit(exitCode || 1), 10_000);
  force.unref();
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error(JSON.stringify({ level: "error", event: "shutdown", message: err?.message }));
    }
    process.exit(exitCode);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// A crash in a request's synchronous path must not leave a half-closed
// server: log structured, then shut down with a failure code so the process
// supervisor restarts it. Unhandled rejections are logged and left to the
// per-request error boundary — the process keeps serving.
process.on("uncaughtException", (err) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "uncaughtException",
      message: err?.message,
      stack: err?.stack,
    }),
  );
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandledRejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    }),
  );
});
