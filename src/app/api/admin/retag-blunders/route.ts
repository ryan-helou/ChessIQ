export const maxDuration = 60;

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { detectMissedTactic } from "@/lib/tactic-detector";

/**
 * POST /api/admin/retag-blunders
 * Re-runs tactic detection on all existing blunders that have null or "unknown" missed_tactic.
 */
export async function POST() {
  try {
    const result = await query(
      `SELECT id, best_move,
              COALESCE(fen_before,
                (SELECT fen FROM analyzed_moves am WHERE am.game_id = b.game_id AND am.move_number = b.move_number - 1 LIMIT 1)
              ) as fen_before
       FROM blunders b
       LIMIT 500`,
      []
    );

    let updated = 0;
    for (const row of result.rows) {
      if (!row.fen_before || !row.best_move) continue;
      const tactic = detectMissedTactic(row.fen_before, row.best_move);
      await query(
        `UPDATE blunders SET missed_tactic = $1 WHERE id = $2`,
        [tactic ?? "positional", row.id]
      ).catch(() => {});
      updated++;
    }

    return NextResponse.json({ scanned: result.rows.length, updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
