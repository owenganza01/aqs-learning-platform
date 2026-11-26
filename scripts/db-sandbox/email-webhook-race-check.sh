#!/usr/bin/env bash
# AQS DB sandbox: concurrency check for the email webhook race (review finding 1, 23 November 2026).
#
# pgTAP runs in one rolled-back transaction, so it cannot show two sessions racing. Like the other
# concurrency checks, this script creates a brand-new throwaway PostgreSQL cluster in a temporary directory,
# listening only on a Unix socket (no TCP port), applies the shim and every migration, commits a synthetic
# fixture, releases the sessions at once through an advisory-lock barrier, checks the result and deletes the
# cluster. It never connects to an existing database. Must run as a non-root user.
#
#   scripts/db-sandbox/email-webhook-race-check.sh
#
# For each of 40 emails being sent, two sessions start at the same instant: the sender recording the provider's
# acceptance (email_mark_accepted) and the webhook recording "delivered" for that provider id
# (email_record_event). Whichever runs first, every email must end "delivered" with its event in the history,
# no event may be left held, and no session may fail.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
N="${N:-40}"
SANDBOX="$(mktemp -d /tmp/aqs-db-webhook.XXXXXX)"
cleanup() { "$PGBIN/pg_ctl" -D "$SANDBOX/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$SANDBOX"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$SANDBOX/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SANDBOX/data" -l "$SANDBOX/log" \
  -o "-c listen_addresses='' -k $SANDBOX -c unix_socket_permissions=0700 -c max_connections=$(( N * 2 + 20 ))" -w start >/dev/null
export PGHOST="$SANDBOX" PGUSER=postgres PGDATABASE=postgres
echo "sandbox cluster: $SANDBOX/data (socket only, no TCP); server $("$PGBIN/postgres" --version)"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/supabase-shim.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$m"; done
echo "applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations"

psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
begin;
select private.enqueue_email('org_workspace_activated', 'zz.race' || i || '@example.test',
       jsonb_build_object('organization_name', 'ZZ Race Org ' || i), 'race:' || i)
  from generate_series(1, $N) i;
set local role service_role;
select count(*) from public.email_claim_batch(50);
commit;
SQL
echo "fixture committed: $N emails claimed (sending)"
q() { psql -qAtX -c "$1"; }
id_of() { q "select id from private.email_outbox where dedupe_key = 'race:$1'"; }

mkdir -p "$SANDBOX/out"
psql -qAtX -c "select pg_advisory_lock(565656); select pg_sleep(2)" >/dev/null &
sleep 0.5
for i in $(seq 1 "$N"); do
  ID=$(id_of "$i")
  printf "select pg_advisory_lock_shared(565656);\nbegin;\nset local role service_role;\nselect 'ACCEPT ' || coalesce(public.email_mark_accepted('%s', 'prov-race-%s')::text, 'ok');\ncommit;\n" "$ID" "$i" \
    | psql -qAtX -v ON_ERROR_STOP=1 >"$SANDBOX/out/a$i" 2>&1 &
  printf "select pg_advisory_lock_shared(565656);\nbegin;\nset local role service_role;\nselect 'EVENT ' || public.email_record_event('prov-race-%s', 'delivered', 'evt-race-%s');\ncommit;\n" "$i" "$i" \
    | psql -qAtX -v ON_ERROR_STOP=1 >"$SANDBOX/out/e$i" 2>&1 &
done
wait

status=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1 (got $2)"; else echo "FAIL  $1 (expected $3, got $2)"; status=1; fi; }
check "every email is delivered"                     "$(q "select count(*) from private.email_outbox where dedupe_key like 'race:%' and status = 'delivered'")" "$N"
check "every delivered event is in the history"      "$(q "select count(*) from private.email_events where provider_event_id like 'evt-race-%'")" "$N"
check "no event is left held"                        "$(q "select count(*) from private.email_held_events where state = 'held'")" 0
check "no session failed"                            "$(grep -l ERROR "$SANDBOX"/out/* 2>/dev/null | wc -l | tr -d ' ')" 0
echo "webhook answers: $(cat "$SANDBOX"/out/e* | grep -o 'EVENT [a-z]*' | sort | uniq -c | tr -s ' ' | paste -sd ';' -)"
[ $status = 0 ] && echo "Result: PASS" || echo "Result: FAIL"
exit $status
