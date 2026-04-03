import express, { Request, Response, NextFunction } from "express";
import { initRedis } from "./cache/redis.js";
import { healthCheck as dbHealthCheck, closePool } from "./db/index.js";
import { getEngine, shutdownEngine } from "./lib/stockfish.js";
import analyzeRouter from "./routes/analyze.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.text({ limit: "50mb", type: "text/plain" }));

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get("/health", async (req: Request, res: Response) => {
  try {
    const dbHealthy = await dbHealthCheck();
    const redisHealthy = await initRedis();
    const engine = await getEngine();
    const engineHealthy = engine.isRunning();

    if (dbHealthy && redisHealthy && engineHealthy) {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        redis: "connected",
        engine: "ready",
      });
    } else {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: dbHealthy ? "connected" : "disconnected",
        redis: redisHealthy ? "connected" : "disconnected",
        engine: engineHealthy ? "ready" : "not ready",
      });
    }
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Routes
app.use("/api/analyze", analyzeRouter);

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down server...");
  await shutdownEngine();
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
async function main() {
  try {
    // Initialize services
    console.log("Initializing Stockfish engine...");
    await getEngine();
    console.log("Stockfish engine ready");

    console.log("Initializing Redis cache...");
    await initRedis();
    console.log("Redis connected");

    console.log("Initializing database...");
    const dbHealthy = await dbHealthCheck();
    if (!dbHealthy) throw new Error("Database not healthy");
    console.log("Database connected");

    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🎯 Chess IQ Backend running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
