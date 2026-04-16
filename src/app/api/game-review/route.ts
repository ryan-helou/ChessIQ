import { NextRequest, NextResponse } from "next/server";
import { analyzeGame, type GameAnalysis } from "@/modules/game-review/analyzer";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { gameReviewBodySchema } from "@/lib/schemas";

/**
 * POST /api/game-review
 * Analyzes a chess game using the Railway Stockfish backend.
 * If chessComId is provided, checks DB cache first and writes result back.
 *
 * Request body:
 * {
 *   "pgn": "1. e4 c5 ...",
 *   "depth": 14          (optional, default 14)
 *   "chessComId": "123"  (optional, enables caching)
 * }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(`game-review:${ip}`, 10, 60_000, { failOpen: false });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 200_000) {
      return NextResponse.json({ error: "PGN too large" }, { status: 413 });
    }
    const parsed = gameReviewBodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const { pgn, depth = 12, chessComId } = parsed.data;

    // Ensure analysis_cache column exists (idempotent)
    await ensureDbInit().catch((err: Error) => console.error('[db-init] failed:', err.message));

    // Check DB cache if we have a game ID
    if (chessComId) {
      try {
        const cached = await query(
          `SELECT analysis_cache FROM games WHERE chess_com_id = $1 AND analysis_cache IS NOT NULL`,
          [chessComId]
        );
        if (cached.rows.length > 0 && cached.rows[0].analysis_cache) {
          return NextResponse.json(cached.rows[0].analysis_cache);
        }
      } catch (dbErr) {
        // Non-fatal: proceed with fresh analysis if DB check fails
        console.warn("[GAME REVIEW API] Cache read failed:", dbErr);
      }
    }

    // Analyze via Railway backend
    const analysis = await analyzeGame(pgn, depth);

    // Persist to DB cache if we have a game ID
    if (chessComId) {
      try {
        await query(
          `UPDATE games SET analysis_cache = $1 WHERE chess_com_id = $2`,
          [JSON.stringify(analysis), chessComId]
        );
      } catch (dbErr) {
        // Non-fatal: return result even if caching fails
        console.warn("[GAME REVIEW API] Cache write failed:", dbErr);
      }
    }

    return NextResponse.json(analysis, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
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
