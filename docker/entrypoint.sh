#!/bin/sh

set -eu

POCKETBASE_BIN=${POCKETBASE_BIN:-/opt/pocketbase/pocketbase}
POCKETBASE_DATA_DIR=${POCKETBASE_DATA_DIR:-/pb_data}
POCKETBASE_HOOKS_DIR=${POCKETBASE_HOOKS_DIR:-/opt/pocketbase/pb_hooks}
POCKETBASE_MIGRATIONS_DIR=${POCKETBASE_MIGRATIONS_DIR:-/opt/pocketbase/pb_migrations}
POCKETBASE_HTTP_ADDR=${POCKETBASE_HTTP_ADDR:-0.0.0.0:8090}
POCKETBASE_URL=${POCKETBASE_URL:-http://127.0.0.1:8090}
POCKETBASE_INIT_MARKER=${POCKETBASE_INIT_MARKER:-$POCKETBASE_DATA_DIR/.newsletter-pocketbase-initialized}
POCKETBASE_RECREATE_COLLECTIONS=${POCKETBASE_RECREATE_COLLECTIONS:-0}
APP_CONFIG_PATH=${APP_CONFIG_PATH:-/usr/share/nginx/html/app-config.js}
APP_ROOT=${APP_ROOT:-/app}

PB_PID=''
NGINX_PID=''

cleanup() {
  if [ -n "$NGINX_PID" ] && kill -0 "$NGINX_PID" 2>/dev/null; then
    kill "$NGINX_PID" 2>/dev/null || true
    wait "$NGINX_PID" 2>/dev/null || true
  fi

  if [ -n "$PB_PID" ] && kill -0 "$PB_PID" 2>/dev/null; then
    kill "$PB_PID" 2>/dev/null || true
    wait "$PB_PID" 2>/dev/null || true
  fi
}

write_app_config() {
  APP_CONFIG_PATH="$APP_CONFIG_PATH" node <<'EOF'
const fs = require('node:fs');

const outputPath = process.env.APP_CONFIG_PATH;
const pocketbasePublicUrl = (process.env.POCKETBASE_PUBLIC_URL || '').trim();
const appPublicUrl = (process.env.APP_PUBLIC_URL || '').trim();
const telemetryRaw = (process.env.NEWSLETTER_TELEMETRY || 'false').trim().toLowerCase();
const telemetry = telemetryRaw === 'true' || telemetryRaw === '1';
const resolvedPocketBaseUrlExpression = JSON.stringify(pocketbasePublicUrl || appPublicUrl) + ' || window.location.origin';

fs.writeFileSync(
  outputPath,
  `window.__APP_CONFIG__ = Object.freeze({ VITE_POCKETBASE_URL: ${resolvedPocketBaseUrlExpression}, NEWSLETTER_TELEMETRY: ${JSON.stringify(telemetry)} });\n`,
  'utf8',
);
EOF
}

wait_for_pocketbase() {
  echo 'Waiting for PocketBase to become healthy...'
  attempts=0

  until curl --silent --show-error --fail "$POCKETBASE_URL/api/health" >/dev/null; do
    attempts=$((attempts + 1))

    if [ "$attempts" -ge 60 ]; then
      echo 'PocketBase did not become healthy in time.' >&2
      exit 1
    fi

    sleep 1
  done
}

run_first_bootstrap() {
  if [ "$POCKETBASE_RECREATE_COLLECTIONS" != "1" ]; then
    echo 'Skipping destructive PocketBase collection recreation.'
    return
  fi

  if [ -f "$POCKETBASE_INIT_MARKER" ]; then
    echo 'PocketBase bootstrap already completed, skipping destructive collection setup.'
    return
  fi

  echo 'Running first-time PocketBase bootstrap...'
  node "$APP_ROOT/scripts/setup-pocketbase-collections.mjs"
  touch "$POCKETBASE_INIT_MARKER"
}

run_safe_bootstrap() {
  echo 'Syncing PocketBase app schema...'
  node "$APP_ROOT/scripts/sync-pocketbase-app-schema.mjs"

  echo 'Syncing PocketBase navigation dropdowns...'
  node "$APP_ROOT/scripts/sync-navigation-dropdowns.mjs"

  echo 'Syncing PocketBase mail settings...'
  node "$APP_ROOT/scripts/sync-pocketbase-mail-settings.mjs"

  echo 'Syncing PocketBase users schema...'
  node "$APP_ROOT/scripts/sync-pocketbase-users-schema.mjs"

  echo 'Syncing PocketBase OIDC settings...'
  node "$APP_ROOT/scripts/sync-pocketbase-oidc-settings.mjs"

  echo 'Ensuring configured app admin exists...'
  node "$APP_ROOT/scripts/ensure-pocketbase-admin.mjs"
}

start_pocketbase() {
  mkdir -p "$POCKETBASE_DATA_DIR"

  cd /opt/pocketbase

  "$POCKETBASE_BIN" --dir "$POCKETBASE_DATA_DIR" superuser upsert "$POCKETBASE_SUPERUSER_EMAIL" "$POCKETBASE_SUPERUSER_PASSWORD"
  "$POCKETBASE_BIN" \
    --dir "$POCKETBASE_DATA_DIR" \
    --hooksDir "$POCKETBASE_HOOKS_DIR" \
    --migrationsDir "$POCKETBASE_MIGRATIONS_DIR" \
    serve --http "$POCKETBASE_HTTP_ADDR" &
  PB_PID=$!
}

start_nginx() {
  nginx -g 'daemon off;' &
  NGINX_PID=$!
}

monitor_processes() {
  while kill -0 "$PB_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
    sleep 1
  done

  if ! kill -0 "$PB_PID" 2>/dev/null; then
    wait "$PB_PID"
    exit $?
  fi

  wait "$NGINX_PID"
}

trap cleanup INT TERM EXIT

if [ -z "${POCKETBASE_SUPERUSER_EMAIL:-}" ] || [ -z "${POCKETBASE_SUPERUSER_PASSWORD:-}" ]; then
  echo 'POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD must be set.' >&2
  exit 1
fi

export POCKETBASE_URL

write_app_config
start_pocketbase
wait_for_pocketbase
run_first_bootstrap
run_safe_bootstrap
start_nginx
monitor_processes
