BEGIN;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions(account_id, expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS idempotency_keys (id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, key_hash BYTEA NOT NULL, operation VARCHAR(80) NOT NULL, request_hash BYTEA NOT NULL, response_status INTEGER, response_body JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, UNIQUE(account_id,key_hash));
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx ON idempotency_keys(expires_at);
CREATE TABLE IF NOT EXISTS economy_ledger (id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, request_id VARCHAR(64), operation VARCHAR(80) NOT NULL, delta JSONB NOT NULL, balance_after JSONB NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS economy_account_created_idx ON economy_ledger(account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS economy_request_idx ON economy_ledger(request_id);
CREATE TABLE IF NOT EXISTS security_events (id BIGSERIAL PRIMARY KEY, account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL, event_type VARCHAR(80) NOT NULL, ip_hash BYTEA, user_agent_hash BYTEA, request_id VARCHAR(64), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_account_idx ON security_events(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS owner_security (id SMALLINT PRIMARY KEY CHECK(id=1), webauthn_required BOOLEAN NOT NULL DEFAULT FALSE, totp_required BOOLEAN NOT NULL DEFAULT FALSE, recovery_disabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO owner_security(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS admin_sessions (id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, token_hash BYTEA UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS admin_sessions_active_idx ON admin_sessions(account_id,expires_at) WHERE revoked_at IS NULL;
COMMIT;

CREATE TABLE IF NOT EXISTS game_config (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  season_start_utc TIMESTAMPTZ NOT NULL,
  gem_offer_start_utc TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_config(id,season_start_utc,gem_offer_start_utc)
VALUES (1, date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
ON CONFLICT(id) DO NOTHING;

ALTER TABLE game_config ADD COLUMN IF NOT EXISTS gem_offer_start_utc TIMESTAMPTZ;
UPDATE game_config SET gem_offer_start_utc=season_start_utc WHERE gem_offer_start_utc IS NULL;
ALTER TABLE game_config ALTER COLUMN gem_offer_start_utc SET NOT NULL;
