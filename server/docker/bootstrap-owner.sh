#!/bin/sh
set -eu
read_secret(){ tr -d '\r\n' < "$1"; }
DB_PASSWORD="$(read_secret "$DB_PASSWORD_FILE")"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}"
exec node scripts/create-owner.mjs
