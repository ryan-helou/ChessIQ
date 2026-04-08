export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { analyzeGame, type GameAnalysis } from "@/modules/game-review/analyzer";

/**
 * POST /api/game-review
 * Analyzes a chess game using local Stockfish engine
 *
 * Request body:
 * {
 *   "pgn": "1. e4 c5 ...",
 *   "depth": 20  (optional, default 18)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pgn, depth = 18 } = body;

    if (!pgn || typeof pgn !== "string") {
      return NextResponse.json(
        { error: "Invalid request: pgn is required" },
        { status: 400 }
      );
    }

    // Analyze the game
    const analysis = await analyzeGame(pgn, depth);

    return NextResponse.json(analysis);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[GAME REVIEW API] Error analyzing game:", errorMessage);

    return NextResponse.json(
      {
        error: "Failed to analyze game",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
