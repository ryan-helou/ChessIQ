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

  // ── Batch INSERT analyzed_moves (single query instead of N queries) ──
  await query(`DELETE FROM analyzed_moves WHERE game_id = $1`, [gameId]).catch(() => {});
  if (moves.length > 0) {
    const cols = 11;
    const placeholders = moves.map((_, i) =>
      `($${i * cols + 1},$${i * cols + 2},$${i * cols + 3},$${i * cols + 4},$${i * cols + 5},$${i * cols + 6},$${i * cols + 7},$${i * cols + 8},$${i * cols + 9},$${i * cols + 10},$${i * cols + 11})`
    ).join(",");
    const flat = moves.flatMap((m) => [
      gameId, m.moveNumber, m.fen, m.move, m.san, m.bestMove,
      m.engineEval, m.accuracy,
      m.classification === "blunder",
      m.classification === "mistake",
      m.classification === "inaccuracy",
    ]);
    await query(
      `INSERT INTO analyzed_moves
        (game_id, move_number, fen, move, san, best_move, evaluation_cp, accuracy, is_blunder, is_mistake, is_inaccuracy)
       VALUES ${placeholders}
       ON CONFLICT DO NOTHING`,
      flat
    ).catch(() => {});
  }

  // ── Batch INSERT blunders (single query instead of N queries) ──
  await query(`DELETE FROM blunders WHERE game_id = $1`, [gameId]).catch(() => {});
  const badMoves = userMoves.filter(
    (m) => m.classification === "blunder" || m.classification === "mistake"
  );
  if (badMoves.length > 0) {
    const tactics = badMoves.map((m) => detectMissedTactic(m.fenBefore ?? m.fen, m.bestMove));
    const cols = 9;
    const placeholders = badMoves.map((_, i) =>
      `($${i * cols + 1},$${i * cols + 2},$${i * cols + 3},$${i * cols + 4},$${i * cols + 5},$${i * cols + 6},$${i * cols + 7},$${i * cols + 8},$${i * cols + 9})`
    ).join(",");
    const flat = badMoves.flatMap((m, i) => [
      gameId, m.moveNumber, m.move, m.bestMove, m.evalBefore, m.engineEval,
      m.classification, tactics[i], m.fenBefore ?? null,
    ]);
    await query(
      `INSERT INTO blunders (game_id, move_number, player_move, best_move, eval_before_cp, eval_after_cp, severity, missed_tactic, fen_before)
       VALUES ${placeholders}
       ON CONFLICT (game_id, move_number) DO UPDATE SET fen_before = EXCLUDED.fen_before`,
      flat
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

    // Atomically claim next pending game (or stale 'analyzing' job > 5 min old).
    // FOR UPDATE SKIP LOCKED prevents two concurrent requests from grabbing the same game.
    const nextResult = await query(
      `UPDATE games
       SET analysis_status = 'analyzing', analysis_started_at = NOW()
       WHERE id = (
         SELECT id FROM games
         WHERE user_id = $1
           AND pgn IS NOT NULL
           AND (
             analysis_status = 'pending'
             OR (analysis_status = 'analyzing' AND analysis_started_at < NOW() - INTERVAL '5 minutes')
           )
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, chess_com_id, pgn, white_username, black_username`,
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

    try {
      // Let the Railway backend's own 55s timeout handle it — avoids mid-flight abort mismatch
      const analysis = await analyzeGame(game.pgn, depth);
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
           accuracy_white = COALESCE($2, accuracy_white),
           accuracy_black = COALESCE($3, accuracy_black)
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
