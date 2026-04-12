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
    // Validate inputs
    const rawMonths = body.months ?? 1;
    const rawCount = body.gameCount ?? 20;
    const months = Math.max(1, Math.min(12, Number(rawMonths) || 1));
    const gameCount = rawCount === "all" ? "all" : Math.max(1, Math.min(200, Number(rawCount) || 20));

    // Fetch games from Chess.com
    const chesscomGames = await getAllGames(username, months);
    if (!chesscomGames || chesscomGames.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone: 0, total: 0 });
    }

    const gamesToProcess = gameCount === "all"
      ? chesscomGames
      : chesscomGames.slice(-(gameCount as number));

    const userId = usernameToUserId(username);

    // Filter to games that have a valid ID and PGN
    const validGames = gamesToProcess
      .map((g) => ({ ...g, chessComId: g.url.split("/").pop() ?? "" }))
      .filter((g) => g.chessComId && g.pgn);

    if (validGames.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone: 0, total: 0 });
    }

    // ── Single batch SELECT to find already-complete games ──
    const ids = validGames.map((g) => g.chessComId);
    const existingResult = await query(
      `SELECT chess_com_id, analysis_status FROM games WHERE chess_com_id = ANY($1::TEXT[])`,
      [ids]
    );
    const existingMap = new Map<string, string>(
      existingResult.rows.map((r: { chess_com_id: string; analysis_status: string }) => [r.chess_com_id, r.analysis_status])
    );

    const toQueue = validGames.filter((g) => existingMap.get(g.chessComId) !== "complete");
    const alreadyDone = validGames.length - toQueue.length;

    if (toQueue.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone, total: alreadyDone });
    }

    // ── Batch upsert all pending games in one query ──
    const cols = 5;
    const placeholders = toQueue.map((_, i) =>
      `($${i * cols + 1}, $${i * cols + 2}, $${i * cols + 3}, $${i * cols + 4}, $${i * cols + 5}, 'pending')`
    ).join(",");
    const flat = toQueue.flatMap((g) => [userId, g.chessComId, g.pgn, g.white.username, g.black.username]);

    try {
      await query(
        `INSERT INTO games (user_id, chess_com_id, pgn, white_username, black_username, analysis_status)
         VALUES ${placeholders}
         ON CONFLICT (chess_com_id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           analysis_status = CASE WHEN games.analysis_status = 'complete' THEN 'complete' ELSE 'pending' END,
           pgn = EXCLUDED.pgn`,
        flat
      );
    } catch (err) {
      console.error("[analyze-queue] Batch upsert failed:", err);
      return NextResponse.json(
        { error: `Database error: ${err instanceof Error ? err.message : "unknown"}. Please try again.` },
        { status: 500 }
      );
    }

    const queued = toQueue.length;
    return NextResponse.json({ queued, alreadyDone, total: queued + alreadyDone });
  } catch (error) {
    console.error("[analyze-queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to queue games", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
