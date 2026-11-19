#!/bin/sh
set -eu

read_secret() { tr -d '\r\n' < "$1"; }
APP_DB_PASSWORD="$(read_secret /run/secrets/app_db_password)"
[ -n "$APP_DB_PASSWORD" ] || { echo 'app_db_password is empty' >&2; exit 1; }
# Escape single quotes for a PostgreSQL string literal.
APP_DB_PASSWORD_SQL=$(printf '%s' "$APP_DB_PASSWORD" | sed "s/'/''/g")

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \\$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cyberarena_app') THEN
    CREATE ROLE cyberarena_app LOGIN PASSWORD '$APP_DB_PASSWORD_SQL';
  ELSE
    ALTER ROLE cyberarena_app LOGIN PASSWORD '$APP_DB_PASSWORD_SQL';
  END IF;
END
\\$\\$;
GRANT CONNECT ON DATABASE cyberarena TO cyberarena_app;
GRANT USAGE ON SCHEMA public TO cyberarena_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO cyberarena_app;
GRANT DELETE ON sessions, admin_sessions, idempotency_keys TO cyberarena_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO cyberarena_app;
REVOKE CREATE ON SCHEMA public FROM cyberarena_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cyberarena_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO cyberarena_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cyberarena_admin IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO cyberarena_app;
SQL
