import { Router, Request, Response } from "express";
import { Chess } from "chess.js";
import { analyzeGame } from "../modules/game-analyzer.js";
import { analyzeStreaming } from "../lib/stockfish.js";

const router = Router();

// FEN validator: 6 fields, valid pieces/rights/ep/halfmove/fullmove
const FEN_RE = /^[rnbqkpRNBQKP1-8]+(?:\/[rnbqkpRNBQKP1-8]+){7} [wb] (?:-|[KQkq]+) (?:-|[a-h][36]) \d+ \d+$/;

// POST /api/analyze/game - Analyze a game PGN
router.post("/game", async (req: Request, res: Response) => {
  try {
    const { pgn, depth = 18 } = req.body as { pgn: string; depth?: number };

    if (!pgn || typeof pgn !== "string" || pgn.length > 200_000) {
      res.status(400).json({ error: "Invalid or missing PGN" });
      return;
    }

    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      if (chess.history().length === 0) {
        res.status(400).json({ error: "PGN contains no moves" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Malformed PGN" });
      return;
    }

    console.log(`Analyzing game (depth ${depth}, ${pgn.length} chars)...`);
    const startTime = Date.now();

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Analysis timed out")), 120_000)
    );
    const analysis = await Promise.race([analyzeGame(pgn, depth), timeout]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `Analysis complete in ${elapsed}s: ${analysis.moves.length} moves, ` +
      `${analysis.blunders.length} blunders, ` +
      `W:${analysis.whiteAccuracy.toFixed(1)}% B:${analysis.blackAccuracy.toFixed(1)}%`
    );

    res.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    const status = error instanceof Error && error.message.includes("timed out") ? 504 : 500;
    res.status(status).json({
      error: "Analysis failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/analyze/position - Evaluate a single FEN position
router.post("/position", async (req: Request, res: Response) => {
  try {
    const { fen, depth = 20 } = req.body as { fen: string; depth?: number };

    if (!fen) {
      res.status(400).json({ error: "FEN is required" });
      return;
    }

    const { getEngine } = await import("../lib/stockfish.js");
    const engine = await getEngine();
    const evaluation = await engine.evaluatePosition(fen, depth);

    res.json(evaluation);
  } catch (error) {
    console.error("Position eval error:", error);
    res.status(500).json({
      error: "Evaluation failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/analyze/stream?fen=...&maxDepth=22&multiPv=8
// Server-Sent Events: emits one `depth` event per completed depth, then `done`.
router.get("/stream", async (req: Request, res: Response) => {
  const fen = String(req.query.fen ?? "");
  const maxDepth = Math.min(Math.max(parseInt(String(req.query.maxDepth ?? "22"), 10) || 22, 8), 30);
  const multiPv = Math.min(Math.max(parseInt(String(req.query.multiPv ?? "8"), 10) || 8, 1), 16);

  if (!fen || !FEN_RE.test(fen)) {
    res.status(400).json({ error: "Invalid or missing fen" });
    return;
  }

  // SSE headers — no compression, no buffering
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat every 15s so proxies don't drop the connection
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  const controller = new AbortController();
  let closed = false;
  const maxLifetime = setTimeout(() => close(), 5 * 60 * 1000);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(maxLifetime);
    controller.abort();
    try { res.end(); } catch { /* ignore */ }
  };

  req.on("close", close);
  req.on("aborted", close);

  try {
    await analyzeStreaming({
      fen,
      maxDepth,
      multiPv,
      minEmitDepth: 8,
      signal: controller.signal,
      onQueued: (position) => {
        if (closed) return;
        send("queued", { position });
      },
      onDepth: (event) => {
        if (closed) return;
        send("depth", event);
      },
      onDone: (finalDepth) => {
        if (closed) return;
        send("done", { finalDepth });
        close();
      },
      onError: (err) => {
        if (closed) return;
        send("error", { message: err.message });
        close();
      },
    });
  } catch (err) {
    if (!closed) {
      send("error", { message: err instanceof Error ? err.message : "stream failed" });
      close();
    }
  }
});

export default router;
