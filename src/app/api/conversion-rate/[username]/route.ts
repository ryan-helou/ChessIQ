import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

const WINNING_THRESHOLD = 250; // centipawns advantage = "winning position"
const MIN_MOVE = 10;            // ignore early opening advantages
const MIN_CONSECUTIVE = 2;      // need advantage for at least 2 consecutive eval points

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch(() => {});

  try {
    // Fetch games with analysis_cache that have evalGraph data
    const result = await query(
      `SELECT
         g.id,
         g.result,
         g.white_username,
         g.black_username,
         g.analysis_cache->'evalGraph' AS eval_graph
       FROM games g
       WHERE (g.white_username = $1 OR g.black_username = $1)
         AND g.analysis_cache IS NOT NULL
         AND g.analysis_cache != 'null'::jsonb
         AND jsonb_array_length(g.analysis_cache->'evalGraph') > 0
       ORDER BY g.played_at DESC
       LIMIT 300`,
      [username]
    );

    let gamesWithAdvantage = 0;
    let converted = 0;
    let squandered = 0; // had big advantage but lost
    let totalAnalyzed = result.rows.length;

    for (const row of result.rows) {
      const isWhite = row.white_username?.toLowerCase() === username.toLowerCase();
      const evalGraph: Array<{ move: number; eval: number; mate: number | null }> =
        row.eval_graph ?? [];

      if (evalGraph.length === 0) { totalAnalyzed--; continue; }

      // Check if player had a winning advantage (>= threshold for MIN_CONSECUTIVE evals)
      // after move MIN_MOVE (avoids counting fleeting opening advantages)
      let hadAdvantage = false;
      let consecutiveCount = 0;

      for (const point of evalGraph) {
        if (point.move < MIN_MOVE) continue;
        const playerEval = isWhite ? point.eval : -point.eval;
        // Mate in X is always +/- winning
        const isMate = point.mate !== null && point.mate !== undefined;
        const isWinning = isMate
          ? (isWhite ? (point.mate ?? 0) > 0 : (point.mate ?? 0) < 0)
          : playerEval >= WINNING_THRESHOLD;

        if (isWinning) {
          consecutiveCount++;
          if (consecutiveCount >= MIN_CONSECUTIVE) {
            hadAdvantage = true;
            break;
          }
        } else {
          consecutiveCount = 0;
        }
      }

      if (!hadAdvantage) continue;

      gamesWithAdvantage++;
      const playerWon =
        (isWhite && row.result === "1-0") ||
        (!isWhite && row.result === "0-1");
      const playerLost =
        (isWhite && row.result === "0-1") ||
        (!isWhite && row.result === "1-0");

      if (playerWon) converted++;
      if (playerLost) squandered++;
    }

    const conversionRate =
      gamesWithAdvantage > 0
        ? Math.round((converted / gamesWithAdvantage) * 100)
        : null;

    return NextResponse.json({
      totalAnalyzed,
      gamesWithAdvantage,
      converted,
      squandered,
      conversionRate,
    });
  } catch (error) {
    console.error("[conversion-rate]", error);
    return NextResponse.json(
      { totalAnalyzed: 0, gamesWithAdvantage: 0, converted: 0, squandered: 0, conversionRate: null },
      { status: 200 }
    );
  }
}
