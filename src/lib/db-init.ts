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

  await query(`
    CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_puzzle
    ON puzzle_attempts(username, puzzle_id)
  `, []).catch(() => {
    // puzzle_attempts table may not exist yet — ignore
  });
}
