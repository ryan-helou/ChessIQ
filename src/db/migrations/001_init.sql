-- Chess IQ Phase 1 Database Schema
-- Initialize tables for game storage, analysis results, and caching

-- Games table (stores game metadata and analysis status)
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  chess_com_id BIGINT UNIQUE,
  pgn TEXT NOT NULL,
  result VARCHAR(10),
  played_at TIMESTAMP,
  white_username VARCHAR(255),
  black_username VARCHAR(255),
  time_control VARCHAR(50),
  opening_eco VARCHAR(3),
  opening_name VARCHAR(255),
  analysis_status VARCHAR(20), -- pending, quick_pass, deep_pass, complete
  analysis_started_at TIMESTAMP,
  analysis_completed_at TIMESTAMP,
  accuracy_white NUMERIC(5,2),
  accuracy_black NUMERIC(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_status ON games(analysis_status);
CREATE INDEX idx_games_chess_com_id ON games(chess_com_id);

-- Analyzed moves (pre-computed engine evaluations)
CREATE TABLE IF NOT EXISTS analyzed_moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number SMALLINT NOT NULL,
  fen VARCHAR(200) NOT NULL,
  move VARCHAR(10) NOT NULL,
  san VARCHAR(10) NOT NULL,
  best_move VARCHAR(10),
  principal_variation VARCHAR(1000),
  evaluation_cp SMALLINT,
  accuracy NUMERIC(5,2),
  is_blunder BOOLEAN DEFAULT FALSE,
  is_mistake BOOLEAN DEFAULT FALSE,
  is_inaccuracy BOOLEAN DEFAULT FALSE,
  tactical_themes JSONB,
  depth_analyzed SMALLINT,
  nodes_searched BIGINT,
  analysis_time_ms SMALLINT,
  analyzed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(game_id, move_number, depth_analyzed)
);

CREATE INDEX idx_analyzed_moves_game_id ON analyzed_moves(game_id);
CREATE INDEX idx_analyzed_moves_fen ON analyzed_moves(fen);

-- Blunders (for loss pattern detection)
CREATE TABLE IF NOT EXISTS blunders (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number SMALLINT NOT NULL,
  player_move VARCHAR(10) NOT NULL,
  best_move VARCHAR(10) NOT NULL,
  eval_before_cp SMALLINT,
  eval_after_cp SMALLINT,
  severity VARCHAR(20), -- blunder, mistake, inaccuracy
  missed_tactic VARCHAR(100), -- pin, fork, skewer, etc.
  consequence TEXT, -- "lost queen", "allowed mate", etc.
  UNIQUE(game_id, move_number)
);

CREATE INDEX idx_blunders_game_id ON blunders(game_id);
CREATE INDEX idx_blunders_severity ON blunders(severity);

-- Position evaluation cache (global, for future Tier 3 optimization)
CREATE TABLE IF NOT EXISTS position_evals (
  id BIGSERIAL PRIMARY KEY,
  fen VARCHAR(200) NOT NULL,
  depth SMALLINT NOT NULL,
  best_move VARCHAR(10),
  evaluation_cp SMALLINT,
  principal_variation VARCHAR(500),
  nodes_searched BIGINT,
  cached_at TIMESTAMP DEFAULT NOW(),
  hits_count BIGINT DEFAULT 1,
  UNIQUE(fen, depth)
);

CREATE INDEX idx_position_evals_fen ON position_evals(fen);
