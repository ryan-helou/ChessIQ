import { Router, Request, Response } from "express";
import { analyzeGame } from "../modules/game-analyzer.js";
import {
  insertGame,
  updateGameAnalysisStatus,
  getGame,
  insertAnalyzedMoves,
  getAnalyzedMoves,
  insertBlunders,
  getBlunders,
} from "../db/index.js";
import { cacheGameAnalysis, getCachedGameAnalysis } from "../cache/redis.js";

const router = Router();

interface AnalyzeRequest {
  pgn: string;
  userId?: string;
  depth?: number;
  metadata?: {
    chess_com_id?: number;
    result?: string;
    played_at?: string;
    white_username?: string;
    black_username?: string;
    time_control?: string;
    opening_eco?: string;
    opening_name?: string;
  };
}

// POST /api/analyze/game - Analyze a game PGN
router.post("/game", async (req: Request, res: Response) => {
  try {
    const { pgn, userId, depth = 18, metadata = {} } = req.body as AnalyzeRequest;

    if (!pgn) {
      return res.status(400).json({ error: "PGN is required" });
    }

    // Analyze the game
    const analysis = await analyzeGame(pgn, depth);
    const { gameId, moves, blunders, whiteAccuracy, blackAccuracy } = analysis;

    // Use a dummy user ID if not provided (for development)
    const actualUserId = userId || "00000000-0000-0000-0000-000000000000";

    // Store in database
    await insertGame(gameId, actualUserId, pgn, {
      chess_com_id: metadata.chess_com_id,
      result: metadata.result,
      played_at: metadata.played_at ? new Date(metadata.played_at) : undefined,
      white_username: metadata.white_username,
      black_username: metadata.black_username,
      time_control: metadata.time_control,
      opening_eco: metadata.opening_eco,
      opening_name: metadata.opening_name,
    });

    // Store analyzed moves
    if (moves.length > 0) {
      await insertAnalyzedMoves(gameId, moves);
    }

    // Store blunders
    if (blunders.length > 0) {
      await insertBlunders(gameId, blunders);
    }

    // Update analysis status
    await updateGameAnalysisStatus(gameId, "complete", whiteAccuracy, blackAccuracy);

    // Cache result
    await cacheGameAnalysis(gameId, analysis);

    res.json({
      status: "success",
      gameId,
      whiteAccuracy: Math.round(whiteAccuracy * 100) / 100,
      blackAccuracy: Math.round(blackAccuracy * 100) / 100,
      movesAnalyzed: moves.length,
      blundersFound: blunders.length,
      analysisDepth: depth,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({
      error: "Analysis failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/analyze/game/:gameId - Get analysis results
router.get("/game/:gameId", async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;

    // Try cache first
    const cached = await getCachedGameAnalysis(gameId);
    if (cached) {
      return res.json({
        status: "success",
        source: "cache",
        ...cached,
      });
    }

    // Get from database
    const game = await getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const moves = await getAnalyzedMoves(gameId);
    const blunders = await getBlunders(gameId);

    const response = {
      status: game.analysis_status,
      gameId,
      pgn: game.pgn,
      moves,
      blunders,
      whiteAccuracy: game.accuracy_white,
      blackAccuracy: game.accuracy_black,
    };

    res.json(response);
  } catch (error) {
    console.error("Get game error:", error);
    res.status(500).json({
      error: "Failed to get game analysis",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/analyze/game/:gameId/status - Get analysis status only (lightweight)
router.get("/game/:gameId/status", async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;

    const game = await getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({
      gameId,
      status: game.analysis_status,
      whiteAccuracy: game.accuracy_white,
      blackAccuracy: game.accuracy_black,
      analysisComplete: game.analysis_status === "complete",
    });
  } catch (error) {
    console.error("Get status error:", error);
    res.status(500).json({
      error: "Failed to get game status",
    });
  }
});

export default router;
