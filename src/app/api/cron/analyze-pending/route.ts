export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { analyzeGame } from "@/modules/game-review/analyzer";
import { persistGameAnalysis } from "@/lib/game-persistence";

/**
 * GET /api/cron/analyze-pending
 * Called every 2 minutes by Vercel Cron.
 * Claims up to 3 pending games across all users and analyzes them via Railway.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbInit();

  // Atomically claim up to 3 pending games (or stale 'analyzing' jobs > 5 min old)
  const claimedResult = await query(
    `UPDATE games
     SET analysis_status = 'analyzing', analysis_started_at = NOW()
     WHERE id IN (
       SELECT id FROM games
       WHERE pgn IS NOT NULL AND (
         analysis_status = 'pending'
         OR (analysis_status = 'analyzing' AND analysis_started_at < NOW() - INTERVAL '5 minutes')
       )
       ORDER BY played_at ASC NULLS LAST
       LIMIT 3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, pgn, white_username, black_username, result`
  );

  const games = claimedResult.rows;
  if (games.length === 0) {
    return NextResponse.json({ analyzed: 0, message: "No pending games" });
  }

  let analyzed = 0;

  for (const game of games) {
    try {
      // Find the owning user's Chess.com username via username match
      const userResult = await query(
        `SELECT chess_com_username FROM users
         WHERE chess_com_username ILIKE $1 OR chess_com_username ILIKE $2
         LIMIT 1`,
        [game.white_username, game.black_username]
      );
      const username = userResult.rows[0]?.chess_com_username ?? game.white_username;

      // Analyze via Railway Stockfish backend
      const analysis = await analyzeGame(game.pgn, 14);

      // Persist moves and blunders
      await persistGameAnalysis(
        game.id,
        username,
        game.white_username,
        game.black_username,
        analysis.moves
      );

      // Compute accuracy for white and black
      const whiteMoves = analysis.moves.filter((m) => m.color === "white");
      const blackMoves = analysis.moves.filter((m) => m.color === "black");
      const avg = (arr: typeof whiteMoves) =>
        arr.length > 0 ? arr.reduce((s, m) => s + (m.accuracy ?? 0), 0) / arr.length : null;

      await query(
        `UPDATE games
         SET analysis_status = 'complete',
             analysis_completed_at = NOW(),
             accuracy_white = $1,
             accuracy_black = $2
         WHERE id = $3`,
        [avg(whiteMoves), avg(blackMoves), game.id]
      );

      analyzed++;
    } catch (err) {
      console.error(`[analyze-pending] Error analyzing game ${game.id}:`, err);
      // Mark failed so it doesn't get stuck in 'analyzing'
      await query(
        "UPDATE games SET analysis_status = 'failed' WHERE id = $1",
        [game.id]
      ).catch(() => {});
    }
  }

  return NextResponse.json({ analyzed, total: games.length });
}
