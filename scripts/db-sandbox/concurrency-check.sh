#!/usr/bin/env bash
# AQS DB sandbox: concurrency check for company-email admission (0022, D40).
#
# pgTAP tests run inside one transaction that is rolled back, so they cannot show what happens
# when several sessions call public.claim_domain_membership() at the same moment. This script
# does. Like run.sh it creates a brand-new throwaway PostgreSQL cluster in a temporary directory,
# listening only on a Unix socket (no TCP port), applies the shim and every migration, commits a
# small synthetic fixture, then starts many sessions that are released at the same instant by an
# advisory-lock barrier. It never connects to an existing database and deletes the cluster.
#
#   scripts/db-sandbox/concurrency-check.sh
#
# Checks:
#   1. Rate limit: 40 simultaneous attempts by one person -> exactly 20 are allowed and recorded,
#      exactly 20 are refused (54000), never more than 20 recorded attempts.
#   2. Idempotent admission: 20 simultaneous attempts by one eligible person -> exactly one
#      membership, the Learner role only, no enrolment, exactly one domain.admission audit row;
#      exactly one session answers "joined" and the others "already_member".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
SANDBOX="$(mktemp -d /tmp/aqs-db-concurrency.XXXXXX)"
cleanup() { "$PGBIN/pg_ctl" -D "$SANDBOX/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$SANDBOX"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$SANDBOX/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SANDBOX/data" -l "$SANDBOX/log" \
  -o "-c listen_addresses='' -k $SANDBOX -c unix_socket_permissions=0700 -c max_connections=100" -w start >/dev/null
export PGHOST="$SANDBOX" PGUSER=postgres PGDATABASE=postgres
echo "sandbox cluster: $SANDBOX/data (socket only, no TCP); server $("$PGBIN/postgres" --version)"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-sandbox/supabase-shim.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 --single-transaction -f "$m"
done
echo "applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations"

PA=00000000-0000-4000-8000-00000000c000
ADM=00000000-0000-4000-8000-00000000c001
ANN=00000000-0000-4000-8000-00000000c010
RITA=00000000-0000-4000-8000-00000000c011

# Synthetic fixture, committed so that every session can see it: an active organisation whose
# domain zz-acme.example.test is verified and admission-enabled; Ann (zz-acme, eligible) and
# Rita (zz-other, never eligible, so every attempt only exercises the rate limit).
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('$PA',   'pa@zz-aqs.example.test',     '{"full_name": "ZZ Pat Admin"}'),
  ('$ADM',  'adma@zz-acme.example.test',  '{"full_name": "ZZ Ada Acme"}'),
  ('$ANN',  'ann@zz-acme.example.test',   '{"full_name": "ZZ Ann"}'),
  ('$RITA', 'rita@zz-other.example.test', '{"full_name": "ZZ Rita"}');
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), 'g-' || u.id::text, u.id,
       jsonb_build_object('sub', 'g-' || u.id::text, 'email', u.email, 'email_verified', true,
                          'hd', split_part(u.email, '@', 2)),
       'google', now(), now(), now()
  from auth.users u where u.id in ('$ANN', '$RITA');
select private.grant_platform_admin('$PA', 'AQS Owner (test)', 'PA for the concurrency check');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$PA", "role": "authenticated"}', true);
select set_config('t.org', public.create_organization('ZZ Acme', 'zz-acme')::text, true);
select public.grant_org_role(current_setting('t.org')::uuid, '$ADM', 'org_admin');
reset role;
insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
select current_setting('t.org')::uuid, p.email, 'org_admin', sha256(convert_to('concurrency-fixture', 'UTF8')),
       'accepted', '$ADM', '$ADM', now()
  from public.profiles p where p.id = '$ADM';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$PA", "role": "authenticated"}', true);
select public.set_organization_status(current_setting('t.org')::uuid, 'active');
select public.add_organization_domain(current_setting('t.org')::uuid, 'zz-acme.example.test');
reset role;
select set_config('t.dom', (select id from private.organization_domains where domain = 'zz-acme.example.test')::text, true);
set local role service_role;
select public.record_domain_verification(current_setting('t.dom')::uuid, '$PA', 'found', true, '{}');
reset role;
commit;
SQL
echo "fixture committed: active organisation, verified and enabled domain, two people"

# Start N sessions for one person; all wait on a shared advisory lock that a barrier session
# holds exclusively, then run claim_domain_membership() in their own transactions at once.
burst() {
  local who="$1" n="$2" out="$SANDBOX/$3"
  mkdir -p "$out"
  psql -qAtX -c "select pg_advisory_lock(424242); select pg_sleep(2)" >/dev/null &
  sleep 0.5
  for i in $(seq 1 "$n"); do
    psql -qAtX -v ON_ERROR_STOP=1 >"$out/$i" 2>&1 <<SQL &
select pg_advisory_lock_shared(424242);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$who", "role": "authenticated"}', true);
select public.claim_domain_membership();
commit;
SQL
  done
  wait
}
count() { grep -l -- "$2" "$SANDBOX/$1"/* 2>/dev/null | wc -l | tr -d ' '; }
q() { psql -qAtX -c "$1"; }
status=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1 (got $2)"; else echo "FAIL  $1 (expected $3, got $2)"; status=1; fi
}

# 1. Rate limit under concurrency.
burst "$RITA" 40 rita
check "rate limit: sessions allowed through"             "$(count rita not_eligible)"        20
check "rate limit: sessions refused with 54000"          "$(count rita 'too many attempts')" 20
check "rate limit: attempts recorded (never above 20)"   "$(q "select count(*) from private.domain_admission_attempts where user_id = '$RITA'")" 20
check "rate limit: no unexpected errors"                 "$(grep -l ERROR "$SANDBOX"/rita/* 2>/dev/null | xargs -r grep -L 'too many attempts' | wc -l | tr -d ' ')" 0

# 2. Idempotent admission under concurrency.
burst "$ANN" 20 ann
check "admission: exactly one session joined"            "$(count ann '"status": "joined"')"         1
check "admission: the others answered already_member"    "$(count ann '"status": "already_member"')" 19
check "admission: exactly one membership"                "$(q "select count(*) from public.organization_memberships where user_id = '$ANN'")" 1
check "admission: Learner role only"                     "$(q "select string_agg(r.role::text, ',') from public.membership_roles r join public.organization_memberships m on m.id = r.membership_id where m.user_id = '$ANN'")" learner
check "admission: no enrolment"                          "$(q "select count(*) from public.enrollments where user_id = '$ANN'")" 0
check "admission: exactly one domain.admission audit row" "$(q "select count(*) from private.organization_audit where action = 'domain.admission' and target_user_id = '$ANN'")" 1
check "admission: no errors"                             "$(grep -l ERROR "$SANDBOX"/ann/* 2>/dev/null | wc -l | tr -d ' ')" 0

[ $status = 0 ] && echo "Result: PASS" || echo "Result: FAIL"
exit $status
