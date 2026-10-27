import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import interviewRoutes from "./routes/interviews.routes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";

export const app = express();

// The Vite dev server proxies /api to us; trust its forwarded IP so
// express-rate-limit keys on the real client address.
app.set("trust proxy", 1);

// Secure defaults for an API (no HTML is served here): hiding X-Powered-By,
// HSTS, no-sniff, frame denial, referrer policy. CSP stays at helmet's
// default — it does not constrain JSON responses.
app.use(helmet());

// CORS is opt-in via CORS_ORIGINS (validated in config/env.js: absolute
// origins, wildcards rejected). Unset = same-origin only, which is how the
// Vite dev proxy and a same-site production deployment run. The allowlist
// never reflects a disallowed origin, and credentials are always limited to
// the configured list — never "*".
if (env.CORS_ORIGINS) {
  const allowed = new Set(env.CORS_ORIGINS);
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser tools send no Origin; same-origin requests don't need
        // the header. Disallowed origins simply get no CORS headers.
        cb(null, !origin || allowed.has(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 86400,
    }),
  );
}

app.use(requestId);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Liveness: the process is up and answering. Cheap by design.
app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

// Readiness: database reachable — the deployment gate for routing traffic.
// Reports availability only; no env, versions or user data.
app.get("/api/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/interviews", interviewRoutes);

app.use(notFound);
app.use(errorHandler);
