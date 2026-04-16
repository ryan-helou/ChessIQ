import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { withCache, cachedResponse } from "@/lib/api-cache";

interface PrepRow {
  opening: string;
  eco: string;
  games: string;
  avg_prep_depth: string | null;
  first_non_book_accuracy: string | null;
}

interface OpeningPrepResult {
  name: string;
  eco: string;
  avgPrepDepth: number;
  games: number;
  firstNonBookAccuracy: number | null;
}

/**
 * GET /api/opening-prep/[username]
 * Returns opening preparation depth stats per opening.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    await ensureDbInit().catch((err: Error) =>
      console.error("[opening-prep] db-init failed:", err.message)
    );

    const { data, cached } = await withCache(`opening-prep:${username}`, async () => {
      let rows: PrepRow[];

      try {
        // Try LATERAL join for richer data (prep depth + first non-book accuracy)
        const result = await query(
          `SELECT g.opening, g.eco,
             COUNT(DISTINCT g.id) as games,
             AVG(sub.book_depth) as avg_prep_depth,
             AVG(sub.first_non_book_accuracy) as first_non_book_accuracy
           FROM games g
           JOIN LATERAL (
             SELECT
               COUNT(*) FILTER (WHERE am.classification = 'book') as book_depth,
               (SELECT am2.accuracy FROM analyzed_moves am2
                WHERE am2.game_id = g.id AND am2.classification != 'book'
                ORDER BY am2.move_number LIMIT 1) as first_non_book_accuracy
             FROM analyzed_moves am WHERE am.game_id = g.id
           ) sub ON true
           WHERE (g.white_username = $1 OR g.black_username = $1)
             AND g.analysis_status = 'complete'
             AND g.opening IS NOT NULL
           GROUP BY g.opening, g.eco
           HAVING COUNT(DISTINCT g.id) >= 2
           ORDER BY games DESC`,
          [username]
        );
        rows = result.rows;
      } catch {
        // Fallback: simpler query without LATERAL
        const result = await query(
          `SELECT g.opening, g.eco, COUNT(DISTINCT g.id) as games,
             AVG((SELECT COUNT(*) FROM analyzed_moves am WHERE am.game_id = g.id AND am.classification = 'book')) as avg_prep_depth
           FROM games g
           WHERE (g.white_username = $1 OR g.black_username = $1)
             AND g.analysis_status = 'complete' AND g.opening IS NOT NULL
           GROUP BY g.opening, g.eco HAVING COUNT(DISTINCT g.id) >= 2
           ORDER BY games DESC`,
          [username]
        );
        rows = result.rows.map((r: { opening: string; eco: string; games: string; avg_prep_depth: string | null }) => ({
          ...r,
          first_non_book_accuracy: null,
        }));
      }

      const openings: OpeningPrepResult[] = rows.map((r) => ({
        name: r.opening,
        eco: r.eco,
        avgPrepDepth: r.avg_prep_depth ? parseFloat(parseFloat(r.avg_prep_depth).toFixed(1)) : 0,
        games: parseInt(r.games, 10),
        firstNonBookAccuracy: r.first_non_book_accuracy
          ? parseFloat(parseFloat(r.first_non_book_accuracy).toFixed(1))
          : null,
      }));

      const totalWeightedDepth = openings.reduce((sum, o) => sum + o.avgPrepDepth * o.games, 0);
      const totalGames = openings.reduce((sum, o) => sum + o.games, 0);
      const overallAvgDepth = totalGames > 0
        ? parseFloat((totalWeightedDepth / totalGames).toFixed(1))
        : 0;

      return { openings, overallAvgDepth };
    });

    return cachedResponse(data, cached);
  } catch (error) {
    console.error("[opening-prep] Error:", error);
    return cachedResponse(
      { openings: [], overallAvgDepth: 0 },
      false
    );
  }
}
