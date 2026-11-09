#!/usr/bin/env bash
# AQS DB sandbox runner. Creates a brand-new throwaway PostgreSQL cluster in a
# temporary directory, listening only on a Unix socket inside that directory
# (no TCP port), applies the Supabase shim, the committed/approved migrations and
# any draft migrations given with --draft, runs pgTAP files, then deletes the
# cluster. It never connects to an existing database.
#
#   scripts/db-sandbox/run.sh [--draft file.sql ...] [--test file.sql ...] [--keep]
# Without --test it runs supabase/tests/database/*.sql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DRAFTS=(); TESTS=(); KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --draft) DRAFTS+=("$2"); shift 2 ;;
    --test)  TESTS+=("$2"); shift 2 ;;
    --keep)  KEEP=1; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
[ ${#TESTS[@]} -eq 0 ] && TESTS=("$ROOT"/supabase/tests/database/*.sql)
SANDBOX="$(mktemp -d /tmp/aqs-db-sandbox.XXXXXX)"
cleanup() { "$PGBIN/pg_ctl" -D "$SANDBOX/data" -m immediate stop >/dev/null 2>&1 || true; [ $KEEP = 1 ] || rm -rf "$SANDBOX"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$SANDBOX/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SANDBOX/data" -l "$SANDBOX/log" \
  -o "-c listen_addresses='' -k $SANDBOX -c unix_socket_permissions=0700" -w start >/dev/null
export PGHOST="$SANDBOX" PGUSER=postgres PGDATABASE=postgres
echo "sandbox cluster: $SANDBOX/data (socket only, no TCP); server $("$PGBIN/postgres" --version)"
psql -qAt -c "select 'fresh cluster, databases: ' || string_agg(datname, ',') from pg_database" 
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/supabase-shim.sql"
for m in "$ROOT"/supabase/migrations/*.sql "${DRAFTS[@]}"; do
  echo "apply $(basename "$m")"
  psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$m"
done
pg_prove --ext .sql "${TESTS[@]}"
