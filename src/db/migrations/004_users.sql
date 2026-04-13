-- 004_users.sql
-- Auth: users table and password reset tokens

CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL UNIQUE,
  password_hash       TEXT        NOT NULL,
  chess_com_username  TEXT        NOT NULL UNIQUE,
  username_changed_at TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_chess_com_username ON users(chess_com_username);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);
