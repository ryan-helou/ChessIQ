-- Chess IQ Phase 2: Puzzle tables
-- Stores Lichess puzzles and user puzzle attempt tracking

CREATE TABLE IF NOT EXISTS puzzles (
  id VARCHAR(10) PRIMARY KEY,             -- Lichess puzzle ID
  fen VARCHAR(200) NOT NULL,              -- Starting position
  moves VARCHAR(500) NOT NULL,            -- Solution moves (UCI, space-separated)
  rating SMALLINT NOT NULL,
  rating_deviation SMALLINT,
  popularity SMALLINT,
  nb_plays INTEGER,
  themes TEXT[] NOT NULL,                 -- Array of theme tags (Lichess naming)
  opening_tags TEXT[],
  move_count SMALLINT NOT NULL,           -- Number of solution moves
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puzzles_themes ON puzzles USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(rating);
CREATE INDEX IF NOT EXISTS idx_puzzles_popularity ON puzzles(popularity DESC);

-- Player puzzle progress tracking
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  puzzle_id VARCHAR(50) NOT NULL,
  solved BOOLEAN NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 1,
  time_seconds SMALLINT,
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(username);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_puzzle ON puzzle_attempts(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_puzzle ON puzzle_attempts(username, puzzle_id);
