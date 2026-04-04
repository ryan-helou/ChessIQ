import { Pool } from "pg";
import { AnalyzedMove, Blunder } from "../modules/game-analyzer.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client", err);
});

// Games queries
export async function insertGame(
  gameId: string,
  userId: string,
  pgn: string,
  metadata: {
    chess_com_id?: number;
    result?: string;
    played_at?: Date;
    white_username?: string;
    black_username?: string;
    time_control?: string;
    opening_eco?: string;
    opening_name?: string;
  }
): Promise<void> {
  const query = `
    INSERT INTO games (
      id, user_id, chess_com_id, pgn, result, played_at,
      white_username, black_username, time_control, opening_eco, opening_name,
      analysis_status, analysis_started_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      'quick_pass', NOW(), NOW(), NOW()
    )
    ON CONFLICT (chess_com_id) DO UPDATE SET updated_at = NOW()
  `;

  await pool.query(query, [
    gameId,
    userId,
    metadata.chess_com_id,
    pgn,
    metadata.result,
    metadata.played_at,
    metadata.white_username,
    metadata.black_username,
    metadata.time_control,
    metadata.opening_eco,
    metadata.opening_name,
  ]);
}

export async function updateGameAnalysisStatus(
  gameId: string,
  status: "pending" | "quick_pass" | "deep_pass" | "complete",
  whiteAccuracy?: number,
  blackAccuracy?: number
): Promise<void> {
  const query = `
    UPDATE games
    SET
      analysis_status = $2,
      accuracy_white = COALESCE($3, accuracy_white),
      accuracy_black = COALESCE($4, accuracy_black),
      analysis_completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE analysis_completed_at END,
      updated_at = NOW()
    WHERE id = $1
  `;

  await pool.query(query, [gameId, status, whiteAccuracy, blackAccuracy]);
}

export async function getGame(
  gameId: string
): Promise<{
  id: string;
  pgn: string;
  analysis_status: string;
  accuracy_white: number | null;
  accuracy_black: number | null;
} | null> {
  const query = `
    SELECT id, pgn, analysis_status, accuracy_white, accuracy_black
    FROM games
    WHERE id = $1
  `;

  const result = await pool.query(query, [gameId]);
  return result.rows[0] || null;
}

// Analyzed moves queries
export async function insertAnalyzedMoves(
  gameId: string,
  moves: AnalyzedMove[]
): Promise<void> {
  if (moves.length === 0) return;

  const query = `
    INSERT INTO analyzed_moves (
      game_id, move_number, fen, move, san, best_move, principal_variation,
      evaluation_cp, accuracy, is_blunder, is_mistake, is_inaccuracy,
      tactical_themes, depth_analyzed, analyzed_at
    ) VALUES
    ${moves.map((_, i) => {
      const base = i * 11;
      return `($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13})`;
    }).join(",")}
    ON CONFLICT (game_id, move_number, depth_analyzed) DO UPDATE SET
      evaluation_cp = EXCLUDED.evaluation_cp,
      accuracy = EXCLUDED.accuracy,
      is_blunder = EXCLUDED.is_blunder,
      is_mistake = EXCLUDED.is_mistake,
      is_inaccuracy = EXCLUDED.is_inaccuracy,
      analyzed_at = NOW()
  `;

  const values: any[] = [gameId];
  for (const move of moves) {
    values.push(
      move.moveNumber,
      move.fen,
      move.move,
      move.san,
      move.bestMove,
      move.bestMoveSan,
      Math.round(move.engineEval),
      Math.round(move.accuracy * 100) / 100,
      move.isBlunder,
      move.isMistake,
      move.isInaccuracy,
      JSON.stringify(move.tacticalThemes)
    );
  }

  await pool.query(query, values);
}

export async function getAnalyzedMoves(gameId: string): Promise<AnalyzedMove[]> {
  const query = `
    SELECT
      move_number as "moveNumber",
      move,
      san,
      fen,
      best_move as "bestMove",
      evaluation_cp as "engineEval",
      accuracy,
      is_blunder as "isBlunder",
      is_mistake as "isMistake",
      is_inaccuracy as "isInaccuracy",
      tactical_themes as "tacticalThemes"
    FROM analyzed_moves
    WHERE game_id = $1
    ORDER BY move_number ASC
  `;

  const result = await pool.query(query, [gameId]);
  return result.rows;
}

// Blunders queries
export async function insertBlunders(
  gameId: string,
  blunders: Blunder[]
): Promise<void> {
  if (blunders.length === 0) return;

  const query = `
    INSERT INTO blunders (
      game_id, move_number, player_move, best_move,
      eval_before_cp, eval_after_cp, severity, missed_tactic, consequence
    ) VALUES
    ${blunders.map((_, i) => {
      const base = i * 9;
      return `($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    }).join(",")}
    ON CONFLICT (game_id, move_number) DO UPDATE SET
      severity = EXCLUDED.severity,
      missed_tactic = EXCLUDED.missed_tactic,
      consequence = EXCLUDED.consequence
  `;

  const values: any[] = [gameId];
  for (const blunder of blunders) {
    values.push(
      blunder.moveNumber,
      blunder.playerMove,
      blunder.bestMove,
      blunder.evalBeforeCp,
      blunder.evalAfterCp,
      blunder.severity,
      blunder.missedTactic,
      blunder.consequence
    );
  }

  await pool.query(query, values);
}

export async function getBlunders(gameId: string): Promise<Blunder[]> {
  const query = `
    SELECT
      move_number as "moveNumber",
      player_move as "playerMove",
      best_move as "bestMove",
      eval_before_cp as "evalBeforeCp",
      eval_after_cp as "evalAfterCp",
      severity,
      missed_tactic as "missedTactic",
      consequence
    FROM blunders
    WHERE game_id = $1
    ORDER BY move_number ASC
  `;

  const result = await pool.query(query, [gameId]);
  return result.rows;
}

// Position cache queries
export async function getCachedEval(fen: string, depth: number): Promise<{
  bestMove: string;
  evaluation_cp: number;
  principal_variation: string;
} | null> {
  const query = `
    SELECT best_move, evaluation_cp, principal_variation
    FROM position_evals
    WHERE fen = $1 AND depth = $2
  `;

  const result = await pool.query(query, [fen, depth]);
  return result.rows[0] || null;
}

export async function insertPositionEval(
  fen: string,
  depth: number,
  bestMove: string,
  evaluationCp: number,
  principalVariation: string
): Promise<void> {
  const query = `
    INSERT INTO position_evals (fen, depth, best_move, evaluation_cp, principal_variation)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (fen, depth) DO UPDATE SET
      hits_count = hits_count + 1,
      cached_at = NOW()
  `;

  await pool.query(query, [fen, depth, bestMove, evaluationCp, principalVariation]);
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT NOW()");
    return !!result.rows[0];
  } catch {
    return false;
  }
}

// Shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}
