#!/usr/bin/env bash
# AQS DB sandbox against Supabase Storage's REAL schema (added 27 October 2026).
#
# Same throwaway, socket-only cluster as run.sh, but the shim's storage stand-in is replaced by
# Supabase Storage's own tenant migrations (github.com/supabase/storage, pinned below), applied the
# way the Storage service applies them: numeric order, search_path = storage, "generate-sql" files
# executed for their result, CONCURRENTLY removed. Then every AQS migration and the pgTAP suite.
#
# Safety mode used by this validated workflow:
#   - Network access is not used during the run. Supply STORAGE_DIR.
#   - The script runs in a container started with --network none.
#   - Only explicitly supplied, read-only repository and offline storage sources may be mounted.
#   - Protected containers, volumes and databases are never used by this script.
#
#   scripts/db-sandbox/run-real-storage.sh [test.sql ...]
#   STORAGE_DIR=/path/to/supabase/storage/migrations/tenant \
#   REAL_STORAGE_EVIDENCE_DIR=/path/to/evidence \
#   KEEP_SANDBOX=1 ...
#
# Variables:
#   STORAGE_DIR           Offline Supabase Storage migration tree. Required. Must check out
#                         exactly STORAGE_COMMIT and have a clean working tree.
#   PGBIN                 PostgreSQL 17 binary directory. Defaults to the highest installed
#                         version under /usr/lib/postgresql.
#   STORAGE_COMMIT        Expected Storage source commit. Defaults to the validated pin.
#   REAL_STORAGE_EVIDENCE_DIR  Persistent host-side directory for logs. Never deleted.
#   KEEP_SANDBOX          1 preserves the temporary cluster; 0 cleans up after success.
#
# Needs: bash, PostgreSQL 17 server binaries, pgTAP and pg_prove, awk, git, storage source.
# Must run as a non-root user.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STORAGE_COMMIT="${STORAGE_COMMIT:-60a63967702ff998e3427afa56e4263b4c9f51f9}"
STORAGE_REPO="https://github.com/supabase/storage.git"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
EVIDENCE_DIR="${REAL_STORAGE_EVIDENCE_DIR:-/tmp/aqs-real-storage-evidence}"
KEEP_SANDBOX="${KEEP_SANDBOX:-0}"
SANDBOX=""
EXIT_STATUS=0
RUN_DIR=""

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  EXIT_STATUS=$?
  if [ -n "${RUN_DIR:-}" ] && [ -d "${RUN_DIR:-}" ]; then
    printf '%s\n' "$EXIT_STATUS" >"${RUN_DIR}/exit-status.txt" 2>/dev/null || true
  fi
  if [ -n "${SANDBOX:-}" ] && [ -d "${SANDBOX:-}" ]; then
    "$PGBIN/pg_ctl" -D "$SANDBOX/data" -m immediate stop >/dev/null 2>&1 || true
    if [ "$EXIT_STATUS" -ne 0 ] || [ "${KEEP_SANDBOX:-0}" = "1" ]; then
      echo "Preserving sandbox at $SANDBOX (exit status $EXIT_STATUS)."
    else
      rm -rf "$SANDBOX"
    fi
  fi
  exit "$EXIT_STATUS"
}
trap cleanup EXIT

# Preflight: identity and environment.
if [ "$(id -u)" -eq 0 ]; then
  fail "This script must not run as root."
fi
mkdir -p "$EVIDENCE_DIR"
RUN_DIR="$EVIDENCE_DIR/run-$(date +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$RUN_DIR"
LOG_FILE="$RUN_DIR/run.log"
exec > >(tee -a "$LOG_FILE") 2>&1

if [ -z "${STORAGE_DIR:-}" ]; then
  fail "STORAGE_DIR is required. Validate an offline Supabase Storage checkout first; network access is not used during validation."
fi
if [ ! -d "$STORAGE_DIR" ]; then
  fail "STORAGE_DIR does not exist or is not a directory: $STORAGE_DIR"
fi
if ! git -C "$STORAGE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "STORAGE_DIR is not a git worktree: $STORAGE_DIR"
fi
ACTUAL_COMMIT="$(git -C "$STORAGE_DIR" rev-parse HEAD)"
if [ "$ACTUAL_COMMIT" != "$STORAGE_COMMIT" ]; then
  fail "Storage source commit mismatch: expected $STORAGE_COMMIT, found $ACTUAL_COMMIT"
fi
if [ -n "$(git -C "$STORAGE_DIR" status --porcelain)" ]; then
  fail "Storage source checkout has uncommitted changes"
fi
echo "Storage source verified: $ACTUAL_COMMIT"

if [ -z "$PGBIN" ] || [ ! -d "$PGBIN" ]; then
  fail "PGBIN is not set or is not a directory: ${PGBIN:-<empty>}"
fi
for required_binary in initdb pg_ctl psql postgres; do
  if [ ! -x "$PGBIN/$required_binary" ]; then
    fail "Required PostgreSQL binary is missing: $PGBIN/$required_binary"
  fi
done
PG_VERSION="$("$PGBIN/postgres" --version)"
case "$PG_VERSION" in
  *" 17."*) ;;
  *) fail "PostgreSQL 17 is required, found: $PG_VERSION" ;;
esac
PG_PROVE="$(command -v pg_prove || true)"
if [ -z "$PG_PROVE" ]; then
  fail "pg_prove is not available on PATH"
fi
for required_helper in awk date find git grep ls mktemp sed sort tee; do
  if ! command -v "$required_helper" >/dev/null 2>&1; then
    fail "Required helper executable is missing: $required_helper"
  fi
done
# pgTAP usability is not guessed from extension file locations. It is verified below by
# creating and dropping the extension in the disposable cluster before applying migrations.
for unexpected_var in PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD PGDATA; do
  if [ -n "${!unexpected_var:-}" ]; then
    fail "Unexpected PostgreSQL environment variable is set: $unexpected_var"
  fi
done

TENANT="$STORAGE_DIR"
if [ ! -d "$TENANT" ]; then
  fail "Storage tenant directory does not exist: $TENANT"
fi

ROOT_SQL="$ROOT/supabase/migrations"
if grep -RniE '(^|[[:space:]])(CREATE[[:space:]]+INDEX[[:space:]]+CONCURRENTLY|VACUUM|REINDEX[[:space:]]+CONCURRENTLY|COMMIT)([[:space:];]|$)' "$ROOT_SQL" >/dev/null; then
  fail "An AQS migration contains SQL that is not safe for --single-transaction in the real-storage run"
fi

SANDBOX="$(mktemp -d /tmp/aqs-real-storage-sandbox.XXXXXX)"
if [ ! -d "$SANDBOX" ] || [ -z "$SANDBOX" ]; then
  fail "Failed to create the temporary sandbox directory"
fi
case "$SANDBOX" in
  /tmp/aqs-real-storage-sandbox.*) ;;
  *) fail "Unexpected sandbox path: $SANDBOX" ;;
esac

echo "Real-storage evidence directory: $RUN_DIR"
echo "PostgreSQL version: $PG_VERSION"
echo "pg_prove version: $("$PG_PROVE" --version)"
echo "Storage source: $ACTUAL_COMMIT"
echo "Storage tenant: $TENANT"
echo "Sandbox path: $SANDBOX"

"$PGBIN/initdb" -D "$SANDBOX/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SANDBOX/data" -l "$SANDBOX/log" \
  -o "-c listen_addresses='' -k $SANDBOX -c unix_socket_permissions=0700" -w start >/dev/null
export PGHOST="$SANDBOX" PGUSER=postgres PGDATABASE=postgres
# Preflight the actual target: pgTAP must install successfully before applying migrations.
if ! psql -qAt -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgtap;" >/dev/null 2>&1; then
  fail "pgTAP is installed as an extension file but cannot be created in this PostgreSQL 17 cluster"
fi
echo "sandbox cluster (socket only, no TCP); server $("$PGBIN/postgres" --version)"
echo "fresh cluster, databases: $(psql -qAt -c "select string_agg(datname, ',') from pg_database")"

# The shim without its storage stand-in block.
awk '/^-- Storage stand-in/{skip=1} skip&&/^grant all on storage.buckets, storage.objects/{skip=0; next} !skip' \
  "$ROOT/scripts/db-sandbox/supabase-shim.sql" >"$SANDBOX/shim.sql"
psql -q -v ON_ERROR_STOP=1 -f "$SANDBOX/shim.sql"

export PGOPTIONS="-c search_path=storage,public,extensions -c client_min_messages=warning"
for f in $(ls "$TENANT" | grep '\.sql$' | sort -t- -k1,1n); do
  if head -1 "$TENANT/$f" | grep -q "storage-migrations generate-sql"; then
    psql -qAt -v ON_ERROR_STOP=1 -f "$TENANT/$f" >"$SANDBOX/gen.sql"
    src="$SANDBOX/gen.sql"
  else
    src="$TENANT/$f"
  fi
  sed -e 's/INDEX CONCURRENTLY/INDEX/Ig' -e '/postgres-migrations disable-transaction/d' "$src" >"$SANDBOX/m.sql"
  psql -q -v ON_ERROR_STOP=1 -f "$SANDBOX/m.sql" >/dev/null || { echo "Storage migration failed: $f" >&2; exit 1; }
done
unset PGOPTIONS
echo "real Storage schema: $(psql -qAt -c "select count(*) from pg_tables where schemaname='storage'") tables; storage.objects owner $(psql -qAt -c "select tableowner from pg_tables where schemaname='storage' and tablename='objects'")"

for m in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$m")"
  psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$m"
done

if [ $# -gt 0 ]; then
  "$PG_PROVE" --ext .sql "$@"
else
  "$PG_PROVE" --ext .sql "$ROOT"/supabase/tests/database/*.sql
fi
