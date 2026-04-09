export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { analyzeGame, type AnalyzedMove } from "@/modules/game-review/analyzer";
import { detectMissedTactic } from "@/lib/tactic-detector";

function usernameToUserId(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = Math.imul(31, h) + username.charCodeAt(i) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `00000000-0000-0000-0000-${hex.padStart(12, "0")}`;
}

async function persistGameAnalysis(
  gameId: string,
  username: string,
  whiteUsername: string,
  blackUsername: string,
  moves: AnalyzedMove[],
) {
  const userMoves = moves.filter(
    (m) => (m.color === "white" && username.toLowerCase() === whiteUsername.toLowerCase()) ||
            (m.color === "black" && username.toLowerCase() === blackUsername.toLowerCase())
  );

  // Save analyzed moves
  await query(`DELETE FROM analyzed_moves WHERE game_id = $1`, [gameId]).catch(() => {});
  for (const m of moves) {
    await query(
      `INSERT INTO analyzed_moves
        (game_id, move_number, fen, move, san, best_move, evaluation_cp, accuracy, is_blunder, is_mistake, is_inaccuracy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [gameId, m.moveNumber, m.fen, m.move, m.san, m.bestMove,
       m.engineEval, m.accuracy,
       m.classification === "blunder",
       m.classification === "mistake",
       m.classification === "inaccuracy"]
    ).catch(() => {});
  }

  // Save blunders and mistakes for this player
  await query(`DELETE FROM blunders WHERE game_id = $1`, [gameId]).catch(() => {});
  const badMoves = userMoves.filter(
    (m) => m.classification === "blunder" || m.classification === "mistake"
  );
  for (const m of badMoves) {
    const missedTactic = detectMissedTactic(m.fenBefore ?? m.fen, m.bestMove);
    await query(
      `INSERT INTO blunders (game_id, move_number, player_move, best_move, eval_before_cp, eval_after_cp, severity, missed_tactic)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (game_id, move_number) DO NOTHING`,
      [gameId, m.moveNumber, m.move, m.bestMove, m.evalBefore, m.engineEval, m.classification, missedTactic]
    ).catch(() => {});
  }

  return badMoves.length;
}

/**
 * POST /api/games/[username]/analyze-next
 * Picks the next pending game for this user and analyzes it.
 * Returns progress. Call repeatedly until remaining === 0.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const body = await request.json().catch(() => ({}));
    const depth = body.depth ?? 14;
    const userId = usernameToUserId(username);

    // Find next pending game for this user
    const nextResult = await query(
      `SELECT id, chess_com_id, pgn, white_username, black_username
       FROM games
       WHERE user_id = $1 AND analysis_status = 'pending' AND pgn IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId]
    );

    if (nextResult.rows.length === 0) {
      // No more pending — count completed
      const doneResult = await query(
        `SELECT COUNT(*) as total FROM games WHERE user_id = $1 AND analysis_status = 'complete'`,
        [userId]
      );
      return NextResponse.json({
        done: true,
        remaining: 0,
        analyzed: parseInt(doneResult.rows[0]?.total ?? "0"),
        blundersFound: 0,
      });
    }

    const game = nextResult.rows[0];

    // Mark as in-progress to prevent duplicate processing
    await query(
      `UPDATE games SET analysis_status = 'analyzing', analysis_started_at = NOW() WHERE id = $1`,
      [game.id]
    );

    try {
      const analysis = await analyzeGame(game.pgn, depth, AbortSignal.timeout(45_000));
      const blundersFound = await persistGameAnalysis(
        game.id, username, game.white_username, game.black_username, analysis.moves
      );

      // Update game accuracy + mark complete
      const userMoves = analysis.moves.filter(
        (m: AnalyzedMove) => (m.color === "white" && username.toLowerCase() === game.white_username?.toLowerCase()) ||
                              (m.color === "black" && username.toLowerCase() === game.black_username?.toLowerCase())
      );
      const accuracy = userMoves.length > 0
        ? Math.round(userMoves.reduce((s: number, m: AnalyzedMove) => s + m.accuracy, 0) / userMoves.length)
        : null;

      await query(
        `UPDATE games SET
           analysis_status = 'complete',
           analysis_completed_at = NOW(),
           accuracy_white = $2,
           accuracy_black = $3
         WHERE id = $1`,
        [
          game.id,
          username.toLowerCase() === game.white_username?.toLowerCase() ? accuracy : null,
          username.toLowerCase() === game.black_username?.toLowerCase() ? accuracy : null,
        ]
      );

      // Count remaining
      const remainingResult = await query(
        `SELECT COUNT(*) as cnt FROM games WHERE user_id = $1 AND analysis_status IN ('pending', 'analyzing')`,
        [userId]
      );
      const remaining = parseInt(remainingResult.rows[0]?.cnt ?? "0");

      return NextResponse.json({ done: remaining === 0, remaining, blundersFound, gameId: game.chess_com_id });
    } catch (err) {
      console.error(`[analyze-next] Failed game ${game.chess_com_id}:`, err);
      // Mark failed game as skipped so we don't retry it endlessly
      await query(
        `UPDATE games SET analysis_status = 'failed' WHERE id = $1`,
        [game.id]
      ).catch(() => {});

      // Count remaining and continue — don't crash the loop over one bad game
      const remainingResult = await query(
        `SELECT COUNT(*) as cnt FROM games WHERE user_id = $1 AND analysis_status IN ('pending', 'analyzing')`,
        [userId]
      ).catch(() => ({ rows: [{ cnt: "0" }] }));
      const remaining = parseInt(remainingResult.rows[0]?.cnt ?? "0");

      return NextResponse.json({
        done: remaining === 0,
        remaining,
        blundersFound: 0,
        gameId: game.chess_com_id,
        skipped: true,
      });
    }
  } catch (error) {
    console.error("[analyze-next] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze game", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
