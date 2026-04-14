import { query } from "@/lib/db";
import { type AnalyzedMove } from "@/modules/game-review/analyzer";
import { detectMissedTactic } from "@/lib/tactic-detector";

/**
 * Persists analysis results for a single game into analyzed_moves and blunders tables.
 * Used by both the per-user analyze-next route and the background cron.
 */
export async function persistGameAnalysis(
  gameId: string,
  username: string,
  whiteUsername: string,
  blackUsername: string,
  moves: AnalyzedMove[],
): Promise<number> {
  const userMoves = moves.filter(
    (m) => (m.color === "white" && username.toLowerCase() === whiteUsername.toLowerCase()) ||
            (m.color === "black" && username.toLowerCase() === blackUsername.toLowerCase())
  );

  // ── Batch INSERT analyzed_moves ──
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
    ).catch((err: Error) => { console.error("[game-persistence] analyzed_moves insert failed:", err.message); throw err; });
  }

  // ── Batch INSERT blunders ──
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
    ).catch((err: Error) => { console.error("[game-persistence] blunders insert failed:", err.message); throw err; });
  }

  return badMoves.length;
}
