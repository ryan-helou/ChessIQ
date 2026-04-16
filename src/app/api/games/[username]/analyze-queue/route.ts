import { NextRequest, NextResponse } from "next/server";
import { getAllGames } from "@/lib/chess-com-api";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { usernameToUserId } from "@/lib/user-id";

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
    const retryFailed: boolean = body.retryFailed === true;
    const months = Math.max(1, Math.min(12, Number(rawMonths) || 1));
    const gameCount = rawCount === "all" ? "all" : Math.max(1, Math.min(200, Number(rawCount) || 20));

    // Ensure schema columns exist before inserting
    await ensureDbInit().catch((err: Error) => console.error("[analyze-queue] db-init failed:", err.message));

    const userId = usernameToUserId(username);

    // If retrying failed games, reset them to pending first
    let failedCount = 0;
    if (retryFailed) {
      const failedResult = await query(
        `UPDATE games SET analysis_status = 'pending' WHERE analysis_status = 'failed' AND user_id = $1 RETURNING chess_com_id`,
        [userId]
      ).catch(() => ({ rows: [] }));
      failedCount = failedResult.rows.length;
    }

    // Fetch games from Chess.com
    const chesscomGames = await getAllGames(username, months);
    if (!chesscomGames || chesscomGames.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone: 0, total: 0, failedCount });
    }

    const gamesToProcess = gameCount === "all"
      ? chesscomGames
      : chesscomGames.slice(-(gameCount as number));

    // Filter to games that have a valid ID and PGN
    const validGames = gamesToProcess
      .map((g) => ({ ...g, chessComId: g.url.split("/").pop() ?? "" }))
      .filter((g) => g.chessComId && g.pgn);

    if (validGames.length === 0) {
      return NextResponse.json({ queued: 0, alreadyDone: 0, total: 0, failedCount });
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
      return NextResponse.json({ queued: 0, alreadyDone, total: alreadyDone, failedCount });
    }

    // ── Batch upsert all pending games in one query ──
    // Extract opening name from PGN headers inline (no chess.js needed)
    const getOpening = (pgn: string): string => {
      const m = pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);
      if (!m) return "Unknown Opening";
      const parts = m[1].split("/openings/");
      return parts[1]
        ? parts[1].split("?")[0].replace(/-/g, " ").replace(/\.\.\./g, "").trim()
        : "Unknown Opening";
    };
    const getResult = (g: typeof toQueue[0]): string => {
      const wr = g.white.result; const br = g.black.result;
      if (wr === "win") return "1-0";
      if (br === "win") return "0-1";
      return "1/2-1/2";
    };

    const cols = 12;
    const placeholders = toQueue.map((_, i) =>
      `($${i * cols + 1},$${i * cols + 2},$${i * cols + 3},$${i * cols + 4},$${i * cols + 5},$${i * cols + 6},$${i * cols + 7},$${i * cols + 8},$${i * cols + 9},$${i * cols + 10},$${i * cols + 11},$${i * cols + 12},'pending')`
    ).join(",");
    const flat = toQueue.flatMap((g) => [
      userId,
      g.chessComId,
      g.pgn,
      g.white.username,
      g.black.username,
      g.white.rating ?? null,
      g.black.rating ?? null,
      g.time_class ?? null,
      g.eco ?? null,
      getOpening(g.pgn),
      g.end_time ? new Date(g.end_time * 1000).toISOString() : null,
      getResult(g),
    ]);

    try {
      await query(
        `INSERT INTO games (user_id, chess_com_id, pgn, white_username, black_username, white_elo, black_elo, time_class, eco, opening, played_at, result, analysis_status)
         VALUES ${placeholders}
         ON CONFLICT (chess_com_id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           analysis_status = CASE WHEN games.analysis_status = 'complete' THEN 'complete' ELSE 'pending' END,
           pgn = EXCLUDED.pgn,
           white_elo = COALESCE(EXCLUDED.white_elo, games.white_elo),
           black_elo = COALESCE(EXCLUDED.black_elo, games.black_elo),
           time_class = COALESCE(EXCLUDED.time_class, games.time_class),
           eco = COALESCE(EXCLUDED.eco, games.eco),
           opening = COALESCE(EXCLUDED.opening, games.opening),
           played_at = COALESCE(EXCLUDED.played_at, games.played_at),
           result = COALESCE(EXCLUDED.result, games.result)`,
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
    return NextResponse.json({ queued, alreadyDone, total: queued + alreadyDone, failedCount });
  } catch (error) {
    console.error("[analyze-queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to queue games", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
