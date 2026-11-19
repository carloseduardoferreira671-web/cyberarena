#!/bin/sh
set -eu
read_secret(){
  f="$1"
  if [ ! -r "$f" ]; then echo "Missing secret file: $f" >&2; exit 1; fi
  tr -d '\r\n' < "$f"
}
DB_PASSWORD="$(read_secret "$DB_PASSWORD_FILE")"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}"
exec "$@"
