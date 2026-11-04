#!/usr/bin/env bash
# Rollback check (CM1). For each prepared rollback in supabase/rollbacks/, in a throwaway
# socket-only cluster: apply every migration before it (staging order: 0015 before 0014),
# record the catalog fingerprint and a schema-only dump, apply the migration and then its
# rollback, and require both to be identical to the "never applied" state.
# Sandbox evidence only; never connects to an existing database. Run as a non-root user.
#   scripts/db-sandbox/rollback-check.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
M="$ROOT/supabase/migrations"; R="$ROOT/supabase/rollbacks"
# Staging application order: timestamp order except 0014 goes after 0015.
mapfile -t ALL < <(ls "$M"/*.sql | sort)
F14="$M/20261102120000_0014_course_staff_ids_restricted.sql"
ORDER=()
for f in "${ALL[@]}"; do
  [ "$f" = "$F14" ] && continue
  ORDER+=("$f")
  case "$f" in *_0015_*) ORDER+=("$F14") ;; esac
done
check() { # $1 = migration number, $2 = rollback file
  local num="$1" rb="$2" target="" SB
  for f in "${ORDER[@]}"; do case "$f" in *_"$num"_*) target="$f" ;; esac; done
  SB="$(mktemp -d /tmp/aqs-rollback.XXXXXX)"
  "$PGBIN/initdb" -D "$SB/data" -U postgres --auth=trust >/dev/null
  "$PGBIN/pg_ctl" -D "$SB/data" -l "$SB/log" -o "-c listen_addresses='' -k $SB -c unix_socket_permissions=0700" -w start >/dev/null
  export PGHOST="$SB" PGUSER=postgres PGDATABASE=postgres PGOPTIONS="-c client_min_messages=warning"
  psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/supabase-shim.sql"
  for f in "${ORDER[@]}"; do
    [ "$f" = "$target" ] && break
    psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  done
  psql -qAt -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/fingerprint.sql" > "$SB/before.txt"
  "$PGBIN/pg_dump" --schema-only --no-comments postgres | grep -v '^\\\(un\)\?restrict ' > "$SB/before.sql"
  psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$target"
  psql -qAt -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/fingerprint.sql" > "$SB/applied.txt"
  psql -q -v ON_ERROR_STOP=1 -f "$rb"
  psql -qAt -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/fingerprint.sql" > "$SB/after.txt"
  "$PGBIN/pg_dump" --schema-only --no-comments postgres | grep -v '^\\\(un\)\?restrict ' > "$SB/after.sql"
  local ok=1
  cmp -s "$SB/before.txt" "$SB/applied.txt" && { echo "  $num: migration changed nothing?"; ok=0; }
  diff -u "$SB/before.txt" "$SB/after.txt" || ok=0
  diff -u "$SB/before.sql" "$SB/after.sql" || ok=0
  echo "$num: $( [ $ok = 1 ] && echo PASS || echo FAIL ) (fingerprint $(wc -l < "$SB/after.txt") lines, sha256 $(sha256sum < "$SB/after.txt" | cut -c1-12))"
  "$PGBIN/pg_ctl" -D "$SB/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$SB"
  [ $ok = 1 ]
}
status=0
check 0014 "$R/0014_course_staff_ids_restricted.rollback.sql" || status=1
check 0016 "$R/0016_suspended_org_learner_titles.rollback.sql" || status=1
check 0017 "$R/0017_orphaned_file_cleanup.rollback.sql"        || status=1
check 0018 "$R/0018_upload_integrity.rollback.sql"             || status=1
check 0019 "$R/0019_video_review.rollback.sql"                || status=1
exit $status
