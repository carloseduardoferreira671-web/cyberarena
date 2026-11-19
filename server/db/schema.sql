CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  cyber_id VARCHAR(16) UNIQUE NOT NULL,
  name VARCHAR(32) NOT NULL,
  password_salt BYTEA NOT NULL,
  password_hash BYTEA NOT NULL,
  state JSONB NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 1,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash BYTEA UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS community_codes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  rewards JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS code_redemptions (
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_id BIGINT NOT NULL REFERENCES community_codes(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id, code_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);
INSERT INTO community_codes(code,rewards) VALUES
('CYBERARENA001', '{"gems":200,"boxes":{"mini":2,"cyber":2,"mecha":3}}'::jsonb)
ON CONFLICT(code) DO NOTHING;

-- v79 security/economy primitives
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions(account_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key_hash BYTEA NOT NULL,
  operation VARCHAR(80) NOT NULL,
  request_hash BYTEA NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(account_id, key_hash)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS economy_ledger (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id VARCHAR(64),
  operation VARCHAR(80) NOT NULL,
  delta JSONB NOT NULL,
  balance_after JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS economy_account_created_idx ON economy_ledger(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS economy_request_idx ON economy_ledger(request_id);

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  ip_hash BYTEA,
  user_agent_hash BYTEA,
  request_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_account_idx ON security_events(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS owner_security (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  webauthn_required BOOLEAN NOT NULL DEFAULT FALSE,
  totp_required BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO owner_security(id) VALUES (1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash BYTEA UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS admin_sessions_active_idx ON admin_sessions(account_id, expires_at) WHERE revoked_at IS NULL;

-- Shared UTC season clock
CREATE TABLE IF NOT EXISTS game_config (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  season_start_utc TIMESTAMPTZ NOT NULL,
  gem_offer_start_utc TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_config(id,season_start_utc,gem_offer_start_utc)
VALUES (1, date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
ON CONFLICT(id) DO NOTHING;
