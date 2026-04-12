import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/games/[username]/[gameId]
 *
 * Returns a single game's metadata + PGN directly from the DB, without
 * fetching months of data from Chess.com. Used by the game review page
 * when sessionStorage cache is cold (direct URL, bookmark, etc.).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string; gameId: string }> }
) {
  const { username, gameId } = await params;

  if (!username || !gameId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    const result = await query(
      `SELECT
         g.chess_com_id    AS id,
         g.pgn,
         g.white_username,
         g.black_username,
         g.white_elo,
         g.black_elo,
         g.result,
         g.time_class,
         g.opening,
         g.eco,
         g.played_at,
         g.analysis_status
       FROM games g
       WHERE g.chess_com_id = $1
         AND (g.white_username = $2 OR g.black_username = $2)
       LIMIT 1`,
      [gameId, username]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const row = result.rows[0];
    const isWhite = row.white_username?.toLowerCase() === username.toLowerCase();
    const playerColor = isWhite ? "white" : "black";

    return NextResponse.json({
      id: row.id,
      pgn: row.pgn,
      white: row.white_username,
      black: row.black_username,
      whiteElo: String(row.white_elo ?? "?"),
      blackElo: String(row.black_elo ?? "?"),
      result: row.result,
      timeClass: row.time_class,
      opening: row.opening,
      eco: row.eco,
      date: row.played_at ? new Date(row.played_at).toLocaleDateString() : "—",
      playerColor,
      analysisStatus: row.analysis_status,
    });
  } catch (err) {
    console.error("[game-id] DB error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
