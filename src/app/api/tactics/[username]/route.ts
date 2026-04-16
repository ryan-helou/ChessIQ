import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { withCache, cachedResponse } from "@/lib/api-cache";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch((err: Error) =>
    console.error("[tactics] db-init failed:", err.message)
  );

  const { data, cached } = await withCache(`tactics:${username}`, async () => {
    // 1. Per-theme miss counts from blunders
    let themes: { theme: string; missed: number }[] = [];
    try {
      const result = await query(
        `SELECT missed_tactic AS theme, COUNT(*)::int AS missed
         FROM blunders b JOIN games g ON b.game_id = g.id
         WHERE (g.white_username = $1 OR g.black_username = $1)
           AND b.missed_tactic IS NOT NULL
         GROUP BY missed_tactic ORDER BY missed DESC`,
        [username]
      );
      themes = result.rows;
    } catch (err) {
      console.error("[tactics] themes query failed:", err);
    }

    // 2. Per-theme puzzle solve rates
    let puzzleSolveRates: { theme: string; attempted: number; solved: number }[] = [];
    try {
      const result = await query(
        `SELECT unnest(p.themes) AS theme,
                COUNT(*)::int AS attempted,
                SUM(CASE WHEN pa.solved THEN 1 ELSE 0 END)::int AS solved
         FROM puzzle_attempts pa JOIN puzzles p ON pa.puzzle_id = p.id
         WHERE pa.username = $1
         GROUP BY theme ORDER BY attempted DESC`,
        [username]
      );
      puzzleSolveRates = result.rows;
    } catch (err) {
      console.error("[tactics] puzzle solve rates query failed:", err);
    }

    // 3. Total games analyzed
    let totalGamesAnalyzed = 0;
    try {
      const result = await query(
        `SELECT COUNT(*)::int AS total
         FROM games
         WHERE (white_username = $1 OR black_username = $1)
           AND analysis_status = 'complete'`,
        [username]
      );
      totalGamesAnalyzed = result.rows[0]?.total ?? 0;
    } catch (err) {
      console.error("[tactics] total games query failed:", err);
    }

    return { themes, puzzleSolveRates, totalGamesAnalyzed };
  });

  return cachedResponse(data, cached);
}
