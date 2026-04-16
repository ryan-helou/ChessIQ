import * as Sentry from "@sentry/node";
import express, { Request, Response, NextFunction } from "express";
import { initRedis } from "./cache/redis.js";
import { healthCheck as dbHealthCheck, closePool } from "./db/index.js";
import { getEngine, shutdownEngine } from "./lib/stockfish.js";
import analyzeRouter from "./routes/analyze.js";
import puzzlesRouter from "./routes/puzzles.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV || "production",
  });
}

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.text({ limit: "50mb", type: "text/plain" }));

// CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
];

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const engine = await getEngine();
    const engineHealthy = engine.isRunning();
    const status = engineHealthy ? 200 : 503;

    res.status(status).json({
      status: engineHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      engine: engineHealthy ? "ready" : "not ready",
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Routes
app.use("/api/analyze", analyzeRouter);
app.use("/api/puzzles", puzzlesRouter);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Sentry error handler (must be before custom error handler)
Sentry.setupExpressErrorHandler(app);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  Sentry.captureException(err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down server...");
  const forceExit = setTimeout(() => {
    console.error("Forced exit after shutdown timeout");
    process.exit(1);
  }, 5000);
  forceExit.unref();

  try { await shutdownEngine(); } catch { /* ignore */ }
  try { await closePool(); } catch { /* db may not be connected */ }
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
async function main() {
  try {
    // Initialize Stockfish (required)
    console.log("Initializing Stockfish engine...");
    await getEngine();
    console.log("Stockfish engine ready");

    // Initialize optional services
    try {
      await initRedis();
      console.log("Redis connected");
    } catch (error) {
      console.warn("Redis not available (optional):", (error as Error).message);
    }

    try {
      const dbHealthy = await dbHealthCheck();
      if (dbHealthy) console.log("Database connected");
      else console.warn("Database not available (optional)");
    } catch (error) {
      console.warn("Database not available (optional):", (error as Error).message);
    }

    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Chess IQ Backend running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
