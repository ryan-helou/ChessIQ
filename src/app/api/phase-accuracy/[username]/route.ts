import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { withCache, cachedResponse } from "@/lib/api-cache";

interface PhaseStats {
  avg: number;
  count: number;
}

interface PhaseAccuracyResult {
  opening: PhaseStats | null;   // moves 1–10
  middlegame: PhaseStats | null; // moves 11–25
  endgame: PhaseStats | null;    // moves 26+
}

const MIN_MOVES = 50; // minimum moves per phase to report

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch((err: Error) => console.warn("[db-init]", err.message));

  try {
    const { data, cached } = await withCache<PhaseAccuracyResult>(`phase-accuracy:${username}`, async () => {
      const result = await query(
        `SELECT
           CASE WHEN am.move_number <= 10 THEN 'opening'
                WHEN am.move_number <= 25 THEN 'middlegame'
                ELSE 'endgame' END AS phase,
           ROUND(AVG(am.accuracy)::numeric, 1) AS avg,
           COUNT(*) AS count
         FROM analyzed_moves am
         JOIN games g ON am.game_id = g.id
         WHERE (g.white_username = $1 OR g.black_username = $1)
           AND am.accuracy IS NOT NULL
         GROUP BY phase`,
        [username]
      );

      const toStats = (phase: string): PhaseStats | null => {
        const row = result.rows.find((r: { phase: string }) => r.phase === phase);
        if (!row || parseInt(row.count) < MIN_MOVES) return null;
        return { avg: parseFloat(row.avg), count: parseInt(row.count) };
      };

      return {
        opening: toStats("opening"),
        middlegame: toStats("middlegame"),
        endgame: toStats("endgame"),
      };
    });

    return cachedResponse(data, cached);
  } catch (error) {
    console.error("[phase-accuracy]", error);
    return cachedResponse({ opening: null, middlegame: null, endgame: null }, false);
  }
}
