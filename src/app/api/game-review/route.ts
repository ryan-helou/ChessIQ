export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { analyzeGame } from "@/modules/game-review/analyzer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pgn, depth = 18 } = body;

    if (!pgn || typeof pgn !== "string") {
      return NextResponse.json(
        { error: "PGN is required" },
        { status: 400 }
      );
    }

    const clampedDepth = Math.min(Math.max(depth, 10), 25);
    const analysis = await analyzeGame(pgn, clampedDepth);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Game review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
