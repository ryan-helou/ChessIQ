import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Puzzle {
  id: string;
  fen: string;
  moves: string; // space-separated UCI moves
  rating: number;
  themes: string[];
  openingTags: string[];
  moveCount: number;
}

export interface PuzzleAttempt {
  puzzleId: string;
  solved: boolean;
  attempts: number;
  timeSeconds: number | null;
  attemptedAt: Date;
}

export interface WeaknessEntry {
  theme: string;
  count: number;
}

export interface BlunderPuzzle {
  gameId: string;
  moveNumber: number;
  fen: string; // fenBefore — position where the player should find the best move
  bestMove: string; // UCI
  bestMoveSan: string;
  severity: string;
  evalDrop: number;
  theme: string | null;
}

// ─────────────────────────────────────────────────────────────
// Weakness profile
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate missed tactics across all analyzed games for a user.
 */
export async function getUserWeaknessProfile(
  username: string
): Promise<WeaknessEntry[]> {
  const query = `
    SELECT missed_tactic AS theme, COUNT(*)::int AS count
    FROM blunders b
    JOIN games g ON b.game_id = g.id
    WHERE (g.white_username = $1 OR g.black_username = $1)
      AND b.missed_tactic IS NOT NULL
      AND b.missed_tactic != ''
    GROUP BY missed_tactic
    ORDER BY count DESC
  `;

  const result = await pool.query(query, [username]);
  return result.rows;
}

/**
 * Get the player's blunder positions as "own blunder" puzzles.
 */
export async function getBlunderPuzzlesForUser(
  username: string,
  limit: number = 10
): Promise<BlunderPuzzle[]> {
  const query = `
    SELECT
      b.game_id AS "gameId",
      b.move_number AS "moveNumber",
      am.fen,
      b.best_move AS "bestMove",
      am.principal_variation AS "bestMoveSan",
      b.severity,
      (b.eval_before_cp - b.eval_after_cp) AS "evalDrop",
      b.missed_tactic AS theme
    FROM blunders b
    JOIN games g ON b.game_id = g.id
    JOIN analyzed_moves am ON am.game_id = b.game_id AND am.move_number = b.move_number
    WHERE (g.white_username = $1 OR g.black_username = $1)
      AND b.severity IN ('blunder', 'mistake')
    ORDER BY ABS(b.eval_before_cp - b.eval_after_cp) DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [username, limit]);
  return result.rows;
}

// ─────────────────────────────────────────────────────────────
// Puzzle queries
// ─────────────────────────────────────────────────────────────

/**
 * Get puzzles matching specific themes and rating range.
 * Excludes puzzles the user has already solved.
 */
export async function getPuzzlesByThemes(
  themes: string[],
  ratingMin: number,
  ratingMax: number,
  excludeUsername: string | null,
  limit: number = 20
): Promise<Puzzle[]> {
  let query: string;
  let params: any[];

  if (excludeUsername) {
    query = `
      SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.opening_tags AS "openingTags", p.move_count AS "moveCount"
      FROM puzzles p
      WHERE p.themes && $1
        AND p.rating BETWEEN $2 AND $3
        AND NOT EXISTS (
          SELECT 1 FROM puzzle_attempts pa
          WHERE pa.puzzle_id = p.id AND pa.username = $4 AND pa.solved = true
        )
      ORDER BY p.popularity DESC, p.nb_plays DESC
      LIMIT $5
    `;
    params = [themes, ratingMin, ratingMax, excludeUsername, limit];
  } else {
    query = `
      SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.opening_tags AS "openingTags", p.move_count AS "moveCount"
      FROM puzzles p
      WHERE p.themes && $1
        AND p.rating BETWEEN $2 AND $3
      ORDER BY p.popularity DESC, p.nb_plays DESC
      LIMIT $4
    `;
    params = [themes, ratingMin, ratingMax, limit];
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get a single puzzle by ID.
 */
export async function getPuzzle(id: string): Promise<Puzzle | null> {
  const query = `
    SELECT id, fen, moves, rating, themes, opening_tags AS "openingTags", move_count AS "moveCount"
    FROM puzzles
    WHERE id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/**
 * Record a puzzle attempt.
 */
export async function insertPuzzleAttempt(
  username: string,
  puzzleId: string,
  solved: boolean,
  attempts: number,
  timeSeconds: number | null
): Promise<void> {
  const query = `
    INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
    VALUES ($1, $2, $3, $4, $5)
  `;
  await pool.query(query, [username, puzzleId, solved, attempts, timeSeconds]);
}

/**
 * Get user's puzzle stats.
 */
export async function getUserPuzzleStats(username: string): Promise<{
  totalAttempted: number;
  totalSolved: number;
  solveRate: number;
  byTheme: { theme: string; attempted: number; solved: number }[];
}> {
  const statsQuery = `
    SELECT
      COUNT(DISTINCT puzzle_id)::int AS "totalAttempted",
      COUNT(DISTINCT puzzle_id) FILTER (WHERE solved = true)::int AS "totalSolved"
    FROM puzzle_attempts
    WHERE username = $1
  `;

  const themeQuery = `
    SELECT
      unnest(p.themes) AS theme,
      COUNT(DISTINCT pa.puzzle_id)::int AS attempted,
      COUNT(DISTINCT pa.puzzle_id) FILTER (WHERE pa.solved = true)::int AS solved
    FROM puzzle_attempts pa
    JOIN puzzles p ON pa.puzzle_id = p.id
    WHERE pa.username = $1
    GROUP BY theme
    ORDER BY attempted DESC
  `;

  const [statsResult, themeResult] = await Promise.all([
    pool.query(statsQuery, [username]),
    pool.query(themeQuery, [username]),
  ]);

  const stats = statsResult.rows[0] || { totalAttempted: 0, totalSolved: 0 };
  return {
    totalAttempted: stats.totalAttempted,
    totalSolved: stats.totalSolved,
    solveRate: stats.totalAttempted > 0 ? stats.totalSolved / stats.totalAttempted : 0,
    byTheme: themeResult.rows,
  };
}
