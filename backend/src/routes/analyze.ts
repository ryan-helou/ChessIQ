import { Router, Request, Response } from "express";
import { analyzeGame } from "../modules/game-analyzer.js";

const router = Router();

// POST /api/analyze/game - Analyze a game PGN
router.post("/game", async (req: Request, res: Response) => {
  try {
    const { pgn, depth = 18 } = req.body as { pgn: string; depth?: number };

    if (!pgn) {
      res.status(400).json({ error: "PGN is required" });
      return;
    }

    console.log(`Analyzing game (depth ${depth}, ${pgn.length} chars)...`);
    const startTime = Date.now();

    const analysis = await analyzeGame(pgn, depth);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `Analysis complete in ${elapsed}s: ${analysis.moves.length} moves, ` +
      `${analysis.blunders.length} blunders, ` +
      `W:${analysis.whiteAccuracy.toFixed(1)}% B:${analysis.blackAccuracy.toFixed(1)}%`
    );

    res.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({
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

export default router;
