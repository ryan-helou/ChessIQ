import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { withCache, cachedResponse } from "@/lib/api-cache";

/**
 * GET /api/progress/[username]
 * Returns progress timeline data: accuracy trend, blunder frequency,
 * puzzle rating history, and per-theme miss rates over time.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch((err: Error) =>
    console.error("[progress] db-init failed:", err.message)
  );

  const { data, cached } = await withCache(`progress:${username}`, async () => {

  const [accuracyResult, blundersResult, puzzleRatingResult, themeProgressResult] = await Promise.allSettled([
    query(
      `SELECT g.id, g.played_at,
              AVG(am.accuracy) as avg_accuracy
       FROM games g
       JOIN analyzed_moves am ON am.game_id = g.id
       WHERE (g.white_username = $1 OR g.black_username = $1)
         AND g.analysis_status = 'complete'
         AND g.played_at IS NOT NULL
       GROUP BY g.id, g.played_at
       ORDER BY g.played_at ASC`,
      [username]
    ),
    query(
      `SELECT g.id, g.played_at, COUNT(b.id) as blunder_count
       FROM games g
       LEFT JOIN blunders b ON b.game_id = g.id
       WHERE (g.white_username = $1 OR g.black_username = $1)
         AND g.analysis_status = 'complete'
         AND g.played_at IS NOT NULL
       GROUP BY g.id, g.played_at
       ORDER BY g.played_at ASC`,
      [username]
    ),
    query(
      `SELECT rating, recorded_at FROM puzzle_rating_history
       WHERE username = $1
       ORDER BY recorded_at ASC`,
      [username]
    ),
    query(
      `SELECT b.missed_tactic as theme, g.played_at, COUNT(*) as count
       FROM blunders b
       JOIN games g ON b.game_id = g.id
       WHERE (g.white_username = $1 OR g.black_username = $1)
         AND b.missed_tactic IS NOT NULL
         AND g.played_at IS NOT NULL
       GROUP BY b.missed_tactic, g.played_at
       ORDER BY g.played_at ASC`,
      [username]
    ),
  ]);

  const accuracy = accuracyResult.status === "fulfilled"
    ? accuracyResult.value.rows.map((r: any) => ({
        gameId: r.id, playedAt: r.played_at,
        avgAccuracy: parseFloat(Number(r.avg_accuracy).toFixed(1)),
      }))
    : (console.error("[progress] accuracy query failed:", accuracyResult.reason), []);

  const blunders = blundersResult.status === "fulfilled"
    ? blundersResult.value.rows.map((r: any) => ({
        gameId: r.id, playedAt: r.played_at,
        blunderCount: parseInt(r.blunder_count, 10),
      }))
    : (console.error("[progress] blunders query failed:", blundersResult.reason), []);

  const puzzleRating = puzzleRatingResult.status === "fulfilled"
    ? puzzleRatingResult.value.rows.map((r: any) => ({
        rating: r.rating, recordedAt: r.recorded_at,
      }))
    : (console.error("[progress] puzzleRating query failed:", puzzleRatingResult.reason), []);

  const themeProgress = themeProgressResult.status === "fulfilled"
    ? themeProgressResult.value.rows.map((r: any) => ({
        theme: r.theme, playedAt: r.played_at,
        count: parseInt(r.count, 10),
      }))
    : (console.error("[progress] themeProgress query failed:", themeProgressResult.reason), []);

  return { accuracy, blunders, puzzleRating, themeProgress };
  }); // end withCache

  return cachedResponse(data, cached);
}
