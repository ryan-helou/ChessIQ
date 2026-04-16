-- Add classification and position context to analyzed_moves
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS classification VARCHAR(20);
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS fen_before VARCHAR(200);
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS eval_before SMALLINT;
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS eval_drop SMALLINT;
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS color VARCHAR(5);
ALTER TABLE analyzed_moves ADD COLUMN IF NOT EXISTS best_move_san VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_analyzed_moves_classification ON analyzed_moves(classification);

-- Puzzle rating history for progress visualization
CREATE TABLE IF NOT EXISTS puzzle_rating_history (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prh_username ON puzzle_rating_history(username);
