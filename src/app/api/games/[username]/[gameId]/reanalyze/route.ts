import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

/**
 * POST /api/games/[username]/[gameId]/reanalyze
 * Resets a game to 'pending' so the analysis cron picks it up again.
 * Requires the authenticated user to match the username param.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string; gameId: string }> }
) {
  const { username, gameId } = await params;

  // Verify the requesting user owns this profile
  const session = await auth();
  if (!session?.user?.chessComUsername) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.chessComUsername.toLowerCase() !== username.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await query(
      `UPDATE games
       SET analysis_status = 'pending',
           analysis_started_at = NULL,
           analysis_completed_at = NULL
       WHERE chess_com_id = $1
         AND (white_username = $2 OR black_username = $2)
         AND analysis_status NOT IN ('analyzing')
       RETURNING id, analysis_status`,
      [gameId, username]
    );

    if (result.rows.length === 0) {
      // Either game not found, or it's currently being analyzed
      const check = await query(
        `SELECT analysis_status FROM games
         WHERE chess_com_id = $1 AND (white_username = $2 OR black_username = $2)`,
        [gameId, username]
      );
      if (check.rows.length === 0) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      return NextResponse.json({ status: "already_queued" });
    }

    return NextResponse.json({ status: "queued" });
  } catch (err) {
    console.error("[reanalyze]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
