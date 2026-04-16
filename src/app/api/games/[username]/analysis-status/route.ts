import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { usernameToUserId } from "@/lib/user-id";
import { ensureDbInit } from "@/lib/db-init";

/**
 * GET /api/games/[username]/analysis-status
 * Returns aggregate analysis status counts for a user's games.
 * Used by the dashboard progress banner.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  try {
    await ensureDbInit().catch((err: Error) => console.warn("[db-init]", err.message));

    const userId = usernameToUserId(username);

    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE analysis_status = 'pending')   AS pending,
         COUNT(*) FILTER (WHERE analysis_status = 'analyzing') AS analyzing,
         COUNT(*) FILTER (WHERE analysis_status = 'complete')  AS complete,
         COUNT(*) FILTER (WHERE analysis_status = 'failed')    AS failed,
         COUNT(*)                                               AS total
       FROM games
       WHERE user_id = $1 AND pgn IS NOT NULL`,
      [userId]
    );

    const row = result.rows[0];
    return NextResponse.json({
      pending:   parseInt(row.pending   ?? "0"),
      analyzing: parseInt(row.analyzing ?? "0"),
      complete:  parseInt(row.complete  ?? "0"),
      failed:    parseInt(row.failed    ?? "0"),
      total:     parseInt(row.total     ?? "0"),
    });
  } catch (err) {
    console.error("[analysis-status]", err);
    return NextResponse.json(
      { pending: 0, analyzing: 0, complete: 0, failed: 0, total: 0 },
      { status: 200 } // return empty data rather than error to avoid UI noise
    );
  }
}
