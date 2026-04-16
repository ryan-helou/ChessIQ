/**
 * One-time DB initialization — creates tables and indexes needed by the puzzle system.
 * Called lazily on first request; subsequent calls are no-ops (promise cached).
 */
import { query } from "@/lib/db";

let initPromise: Promise<void> | null = null;

export function ensureDbInit(): Promise<void> {
  if (!initPromise) {
    initPromise = _init().catch((err) => {
      // Reset so the next request retries (e.g. transient DB error at startup)
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function _init(): Promise<void> {
  // Group 1: CREATE TABLE statements (must run before ALTERs)
  await Promise.all([
    query(`
      CREATE TABLE IF NOT EXISTS position_good_moves (
        fen TEXT PRIMARY KEY,
        good_moves TEXT[] NOT NULL DEFAULT '{}',
        cached_at TIMESTAMPTZ DEFAULT NOW()
      )
    `, []),
    query(`
      CREATE TABLE IF NOT EXISTS user_puzzle_ratings (
        username TEXT PRIMARY KEY,
        rating INTEGER NOT NULL DEFAULT 1200,
        games_played INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `, []),
    query(`
      CREATE TABLE IF NOT EXISTS puzzle_rating_history (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        rating INTEGER NOT NULL,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `, []).catch(() => {}),
  ]);

  // Group 2: ALTER TABLE statements (all independent, parallelized)
  const alter = (sql: string) => query(sql, []).catch((err: Error) => console.warn("[db-init] alter:", err.message));
  await Promise.all([
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS analysis_cache JSONB`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS white_elo INTEGER`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS black_elo INTEGER`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS time_class TEXT`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS eco TEXT`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS opening TEXT`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ`),
    alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS result TEXT`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS classification VARCHAR(20)`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS fen_before VARCHAR(200)`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS eval_before SMALLINT`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS eval_drop SMALLINT`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS color VARCHAR(5)`),
    alter(`ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS best_move_san VARCHAR(10)`),
  ]);

  // Group 3: Indexes + TTL cleanup (all independent, parallelized)
  const idx = (sql: string) => query(sql, []).catch((err: Error) => console.warn("[db-init] index:", err.message));
  const cleanup = (sql: string) => query(sql, []).catch(() => {});
  await Promise.all([
    cleanup(`DELETE FROM position_good_moves WHERE cached_at < NOW() - INTERVAL '30 days'`),
    cleanup(`DELETE FROM position_evals WHERE cached_at < NOW() - INTERVAL '90 days'`),
    idx(`CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_puzzle ON puzzle_attempts(username, puzzle_id)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_white_username ON games(white_username)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_black_username ON games(black_username)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_user_status ON games(user_id, analysis_status)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_analyzed_moves_game_move ON analyzed_moves(game_id, move_number)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_blunders_game_id ON blunders(game_id)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_chess_com_id ON games(chess_com_id)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at DESC)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_games_analysis_status ON games(analysis_status)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_analyzed_moves_classification ON analyzed_moves(classification)`),
    idx(`CREATE INDEX IF NOT EXISTS idx_prh_username ON puzzle_rating_history(username)`),
  ]);
}
