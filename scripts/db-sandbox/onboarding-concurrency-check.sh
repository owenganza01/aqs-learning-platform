#!/usr/bin/env bash
# AQS DB sandbox: concurrency check for workspace requests and their approval (0025, WS-ONBOARD).
#
# pgTAP runs in one rolled-back transaction, so it cannot show simultaneous sessions. Like
# concurrency-check.sh (0022), this script creates a brand-new throwaway PostgreSQL cluster in a
# temporary directory, listening only on a Unix socket (no TCP port), applies the shim, every migration
# and any --draft files (until 0024 exists: scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql), commits a
# small synthetic fixture, releases many sessions at once through an advisory-lock barrier, checks the
# result and deletes the cluster. It never connects to an existing database.
#
#   scripts/db-sandbox/onboarding-concurrency-check.sh --draft scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql
#
# Checks:
#   1. 20 simultaneous approvals of one request (two Platform Admins) -> exactly one ACTIVE organisation,
#      every session answers with its id, exactly two invitations, one activation email, two invitation
#      emails, one approval audit row, no error.
#   2. 40 simultaneous submissions from one hashed address (P10 L1) -> exactly 5 stored, 35 refused with
#      54000, never more than 5 stored attempts for that hash.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DRAFTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --draft) DRAFTS+=("$2"); shift 2 ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
SANDBOX="$(mktemp -d /tmp/aqs-db-onboarding.XXXXXX)"
cleanup() { "$PGBIN/pg_ctl" -D "$SANDBOX/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$SANDBOX"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$SANDBOX/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SANDBOX/data" -l "$SANDBOX/log" \
  -o "-c listen_addresses='' -k $SANDBOX -c unix_socket_permissions=0700 -c max_connections=100" -w start >/dev/null
export PGHOST="$SANDBOX" PGUSER=postgres PGDATABASE=postgres
echo "sandbox cluster: $SANDBOX/data (socket only, no TCP); server $("$PGBIN/postgres" --version)"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/supabase-shim.sql"
for m in "$ROOT"/supabase/migrations/*.sql "${DRAFTS[@]}"; do
  psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$m"
done
echo "applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations and ${#DRAFTS[@]} draft file(s)"

PA1=00000000-0000-4000-8000-00000000d000
PA2=00000000-0000-4000-8000-00000000d001
HASH=$(printf 'zz-burst-address' | sha256sum | cut -c1-64)

psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('$PA1', 'pa1@zz-aqs.example.test', '{"full_name": "ZZ Pat One"}'),
  ('$PA2', 'pa2@zz-aqs.example.test', '{"full_name": "ZZ Pat Two"}');
select private.grant_platform_admin('$PA1', 'AQS Owner (test)', 'PA1 for the onboarding concurrency check');
select private.grant_platform_admin('$PA2', 'AQS Owner (test)', 'PA2 for the onboarding concurrency check');
insert into private.organization_requests (organization_name, organization_type, country, contact_name, contact_email, contact_role,
                                           learner_range, proposed_admin_emails, status, review_started_by, review_started_at)
values ('ZZ Burst Org', 'company', 'Kenya', 'ZZ Bo Burst', 'bo@zz-burst.example.test', 'Owner', '1-25',
        array['a1@zz-burst.example.test', 'a2@zz-burst.example.test']::extensions.citext[], 'in_review', '$PA1', now());
commit;
SQL
REQ=$(psql -qAtX -c "select id from private.organization_requests where organization_name = 'ZZ Burst Org'")
echo "fixture committed: two Platform Admins, one request in review"

burst() { # $1 = sessions, $2 = output folder, $3 = SQL body generator
  local n="$1" out="$SANDBOX/$2"
  mkdir -p "$out"
  psql -qAtX -c "select pg_advisory_lock(434343); select pg_sleep(2)" >/dev/null &
  sleep 0.5
  for i in $(seq 1 "$n"); do
    "$3" "$i" | psql -qAtX -v ON_ERROR_STOP=1 >"$out/$i" 2>&1 &
  done
  wait
}
approve_sql() {
  local who=$PA1; [ $(( $1 % 2 )) = 0 ] && who=$PA2
  cat <<SQL
select pg_advisory_lock_shared(434343);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$who", "role": "authenticated"}', true);
select 'ORG=' || public.approve_organization_request('$REQ', 'ZZ Burst Org', 'zz-burst-org', 'ZZ checked');
commit;
SQL
}
submit_sql() {
  cat <<SQL
select pg_advisory_lock_shared(434343);
begin;
set local role service_role;
select public.submit_organization_request(jsonb_build_object(
  'organization_name', 'ZZ Burst Applicant $1', 'organization_type', 'company', 'country', 'Kenya',
  'organization_description', 'ZZ A fictional burst applicant.', 'address', 'ZZ 3 Burst Lane, Nairobi',
  'contact_name', 'ZZ Ben Burst', 'contact_email', 'ben$1@zz-burst.example.test', 'contact_role', 'Owner',
  'representative_name', 'ZZ Ben Burst', 'representative_title', 'Owner', 'learner_range', '1-25',
  'wants_domain_admission', false, 'proposed_admin_emails', jsonb_build_array('ben$1@zz-burst.example.test'),
  'terms_accepted', true, 'terms_version', 'terms-2026-11-15', 'form_version', 2), '$HASH');
commit;
SQL
}
q() { psql -qAtX -c "$1"; }
status=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1 (got $2)"; else echo "FAIL  $1 (expected $3, got $2)"; status=1; fi; }

# 1. Simultaneous approvals.
burst 20 approve approve_sql
ORG=$(q "select id from public.organizations where slug = 'zz-burst-org'")
check "approval: exactly one organisation"                "$(q "select count(*) from public.organizations where name = 'ZZ Burst Org'")" 1
check "approval: it is active"                            "$(q "select status from public.organizations where slug = 'zz-burst-org'")" active
check "approval: every session answered with its id"      "$(grep -l "ORG=$ORG" "$SANDBOX"/approve/* | wc -l | tr -d ' ')" 20
check "approval: exactly two invitations"                 "$(q "select count(*) from public.invitations where org_id = '$ORG'")" 2
check "approval: one activation email"                    "$(q "select count(*) from private.email_outbox where kind = 'org_workspace_activated'")" 1
check "approval: two invitation emails"                   "$(q "select count(*) from private.email_outbox where kind = 'org_admin_invitation'")" 2
check "approval: one approval audit row"                  "$(q "select count(*) from private.organization_audit where action = 'organization_request.approve'")" 1
check "approval: no errors"                               "$(grep -l ERROR "$SANDBOX"/approve/* 2>/dev/null | wc -l | tr -d ' ')" 0

# 2. Simultaneous submissions from one address (P10 L1).
burst 40 submit submit_sql
check "submit: requests stored"                           "$(q "select count(*) from private.organization_requests where organization_name like 'ZZ Burst Applicant %'")" 5
check "submit: sessions refused with 54000"               "$(grep -l 'too many requests from this connection' "$SANDBOX"/submit/* | wc -l | tr -d ' ')" 35
check "submit: stored attempts for the hash (never > 5)"  "$(q "select count(*) from private.organization_request_attempts where ip_hash = '$HASH' and outcome = 'stored'")" 5
check "submit: no unexpected errors"                      "$(grep -l ERROR "$SANDBOX"/submit/* 2>/dev/null | xargs -r grep -L 'too many requests' | wc -l | tr -d ' ')" 0

[ $status = 0 ] && echo "Result: PASS" || echo "Result: FAIL"
exit $status
