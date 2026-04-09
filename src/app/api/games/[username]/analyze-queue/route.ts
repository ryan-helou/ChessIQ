export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getAllGames } from "@/lib/chess-com-api";
import { query } from "@/lib/db";

function usernameToUserId(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = Math.imul(31, h) + username.charCodeAt(i) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `00000000-0000-0000-0000-${hex.padStart(12, "0")}`;
}

/**
 * POST /api/games/[username]/analyze-queue
 * Fetches games from Chess.com and inserts them as 'pending' in the DB.
 * Does NOT analyze — just queues. Fast, well within timeout.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const body = await request.json();
    const { months = 1, gameCount = 20 } = body;

    // Fetch games from Chess.com
    const chesscomGames = await getAllGames(username, months);
    if (!chesscomGames || chesscomGames.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone: 0, total: 0 });
    }

    const gamesToProcess = gameCount === "all"
      ? chesscomGames
      : chesscomGames.slice(-gameCount as number);

    const userId = usernameToUserId(username);
    let queued = 0;
    let alreadyDone = 0;
    let errors = 0;

    for (const game of gamesToProcess) {
      const chessComId = game.url.split("/").pop() ?? "";
      if (!chessComId || !game.pgn) continue;

      try {
        // Check if already analyzed
        const existing = await query(
          `SELECT analysis_status FROM games WHERE chess_com_id = $1`,
          [chessComId]
        );

        if (existing.rows.length > 0 && existing.rows[0].analysis_status === "complete") {
          alreadyDone++;
          continue;
        }

        // Upsert as pending (always update user_id so analyze-next can find it)
        await query(
          `
          INSERT INTO games (user_id, chess_com_id, pgn, white_username, black_username, analysis_status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
          ON CONFLICT (chess_com_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            analysis_status = CASE WHEN games.analysis_status = 'complete' THEN 'complete' ELSE 'pending' END,
            pgn = EXCLUDED.pgn
          `,
          [userId, chessComId, game.pgn, game.white.username, game.black.username]
        );
        queued++;
      } catch (err) {
        errors++;
        console.error(`[analyze-queue] Failed to queue game ${chessComId}:`, err);
      }
    }

    if (errors > 0 && queued === 0 && alreadyDone === 0) {
      return NextResponse.json(
        { error: "Database error — could not queue any games. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ queued, alreadyDone, total: queued + alreadyDone });
  } catch (error) {
    console.error("[analyze-queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to queue games", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
