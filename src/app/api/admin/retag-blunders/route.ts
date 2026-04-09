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
      `SELECT id, eval_before_cp, player_move, best_move,
              (SELECT fen FROM analyzed_moves am WHERE am.game_id = b.game_id AND am.move_number = b.move_number LIMIT 1) as fen_before
       FROM blunders b
       WHERE missed_tactic IS NULL OR missed_tactic = 'unknown'
       LIMIT 500`,
      []
    );

    let updated = 0;
    for (const row of result.rows) {
      if (!row.fen_before || !row.best_move) continue;
      const tactic = detectMissedTactic(row.fen_before, row.best_move);
      if (tactic) {
        await query(
          `UPDATE blunders SET missed_tactic = $1 WHERE id = $2`,
          [tactic, row.id]
        ).catch(() => {});
        updated++;
      }
    }

    return NextResponse.json({ scanned: result.rows.length, updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
