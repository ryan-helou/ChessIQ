import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { analyzeGame } from "@/modules/game-review/analyzer";
import { persistGameAnalysis } from "@/lib/game-persistence";

/**
 * GET /api/cron/analyze-pending
 * Called every 2 minutes by server.mjs setInterval.
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
       LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, pgn, white_username, black_username, result`
  );

  const games = claimedResult.rows;
  if (games.length === 0) {
    return NextResponse.json({ analyzed: 0, message: "No pending games" });
  }

  // Batch-fetch all matching usernames in one query (avoids N+1)
  const allUsernames = games.flatMap(g => [g.white_username, g.black_username]).filter(Boolean);
  const userMapResult = await query(
    `SELECT chess_com_username FROM users WHERE LOWER(chess_com_username) = ANY($1::text[])`,
    [allUsernames.map(u => u.toLowerCase())]
  );
  const knownUsernames = new Set(userMapResult.rows.map((r: { chess_com_username: string }) => r.chess_com_username.toLowerCase()));

  // Analyze all claimed games in parallel — total time = slowest game, not sum of all
  const results = await Promise.allSettled(games.map(async (game) => {
    const username = knownUsernames.has(game.white_username?.toLowerCase())
      ? game.white_username
      : game.black_username ?? game.white_username;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Analysis timed out")), 60_000)
    );
    const analysis = await Promise.race([analyzeGame(game.pgn, 12), timeout]);

    await persistGameAnalysis(
      game.id,
      username,
      game.white_username,
      game.black_username,
      analysis.moves
    );

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
  }));

  // Mark failed games — transient errors (network, timeout) reset to 'pending' for retry;
  // permanent errors (bad PGN, no data) mark as 'failed'.
  let analyzed = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      analyzed++;
    } else {
      const reason = (results[i] as PromiseRejectedResult).reason;
      console.error(`[analyze-pending] Error analyzing game ${games[i].id}:`, reason);
      const msg: string = reason?.message ?? "";
      const isTransient = reason?.name === "AbortError"
        || msg.includes("fetch failed")
        || msg.includes("ECONNRESET")
        || msg.includes("ETIMEDOUT")
        || msg.includes("timeout");
      const nextStatus = isTransient ? "pending" : "failed";
      await query(
        "UPDATE games SET analysis_status = $1 WHERE id = $2",
        [nextStatus, games[i].id]
      ).catch((err) => console.error("[analyze-pending] status update failed:", err.message));
    }
  }

  return NextResponse.json({ analyzed, total: games.length });
}
