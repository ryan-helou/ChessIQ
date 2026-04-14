import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

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

  await ensureDbInit().catch(() => {});

  try {
    const result = await query(
      `SELECT am.move_number, am.accuracy
       FROM analyzed_moves am
       JOIN games g ON am.game_id = g.id
       WHERE (g.white_username = $1 OR g.black_username = $1)
         AND am.accuracy IS NOT NULL
       LIMIT 50000`,
      [username]
    );

    const phases = {
      opening: { sum: 0, count: 0 },
      middlegame: { sum: 0, count: 0 },
      endgame: { sum: 0, count: 0 },
    };

    for (const row of result.rows) {
      const move: number = row.move_number;
      const acc: number = parseFloat(row.accuracy);
      if (isNaN(acc)) continue;

      if (move <= 10) {
        phases.opening.sum += acc;
        phases.opening.count++;
      } else if (move <= 25) {
        phases.middlegame.sum += acc;
        phases.middlegame.count++;
      } else {
        phases.endgame.sum += acc;
        phases.endgame.count++;
      }
    }

    const toStats = (p: { sum: number; count: number }): PhaseStats | null => {
      if (p.count < MIN_MOVES) return null;
      return { avg: parseFloat((p.sum / p.count).toFixed(1)), count: p.count };
    };

    const response: PhaseAccuracyResult = {
      opening: toStats(phases.opening),
      middlegame: toStats(phases.middlegame),
      endgame: toStats(phases.endgame),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[phase-accuracy]", error);
    return NextResponse.json(
      { opening: null, middlegame: null, endgame: null },
      { status: 200 }
    );
  }
}
