import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import interviewRoutes from "./routes/interviews.routes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { prisma } from "./db/prisma.js";

export const app = express();

// The Vite dev server proxies /api to us; trust its forwarded IP so
// express-rate-limit keys on the real client address.
app.set("trust proxy", 1);

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", async (req, res) => {
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
