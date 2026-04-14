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
  await query(`
    CREATE TABLE IF NOT EXISTS position_good_moves (
      fen TEXT PRIMARY KEY,
      good_moves TEXT[] NOT NULL DEFAULT '{}',
      cached_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);

  await query(`
    CREATE TABLE IF NOT EXISTS user_puzzle_ratings (
      username TEXT PRIMARY KEY,
      rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);

  // Schema migrations — idempotent column additions
  const alter = (sql: string) => query(sql, []).catch((err: Error) => console.warn("[db-init] alter:", err.message));
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS analysis_cache JSONB`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS white_elo INTEGER`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS black_elo INTEGER`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS time_class TEXT`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS eco TEXT`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS opening TEXT`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ`);
  await alter(`ALTER TABLE games ADD COLUMN IF NOT EXISTS result TEXT`);

  // TTL cleanup — delete stale position cache entries older than 30 days (runs on startup, fast)
  await query(
    `DELETE FROM position_good_moves WHERE cached_at < NOW() - INTERVAL '30 days'`,
    []
  ).catch(() => {});

  // Indexes — all wrapped in catch so a missing table never blocks startup
  const idx = (sql: string) => query(sql, []).catch((err: Error) => console.warn("[db-init] index:", err.message));

  await idx(`CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_puzzle ON puzzle_attempts(username, puzzle_id)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_white_username ON games(white_username)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_black_username ON games(black_username)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_user_status ON games(user_id, analysis_status)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_analyzed_moves_game_move ON analyzed_moves(game_id, move_number)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_blunders_game_id ON blunders(game_id)`);
  // Additional indexes for high-traffic queries
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_chess_com_id ON games(chess_com_id)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at DESC)`);
  await idx(`CREATE INDEX IF NOT EXISTS idx_games_analysis_status ON games(analysis_status)`);
}
