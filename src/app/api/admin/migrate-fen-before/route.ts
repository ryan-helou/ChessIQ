export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/admin/migrate-fen-before
 * Adds fen_before column to blunders table and backfills it.
 * Safe to run multiple times (idempotent).
 *
 * Strategy: join blunders → analyzed_moves on (game_id, move_number, move=player_move)
 * to get the AM row for the actual blunder ply, then take the fen from the row
 * immediately preceding it (by insertion id) in the same game.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // 1. Add column if missing
    await query(`
      ALTER TABLE blunders ADD COLUMN IF NOT EXISTS fen_before TEXT
    `, []);

    // 2. Backfill using row ordering in analyzed_moves
    // Find the analyzed_move row for each blunder (match on game_id + move_number + UCI move),
    // then get the fen of the row with the highest id that's still less than that row's id.
    const result = await query(`
      UPDATE blunders b
      SET fen_before = prev_am.fen
      FROM analyzed_moves am
      JOIN analyzed_moves prev_am
        ON prev_am.game_id = am.game_id
        AND prev_am.id = (
          SELECT MAX(id) FROM analyzed_moves
          WHERE game_id = am.game_id AND id < am.id
        )
      WHERE am.game_id = b.game_id
        AND am.move_number = b.move_number
        AND am.move = b.player_move
        AND b.fen_before IS NULL
      RETURNING b.id
    `, []);

    return NextResponse.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
