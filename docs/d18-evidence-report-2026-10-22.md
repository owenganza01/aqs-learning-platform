# D18 evidence report (22 Oct 2026)

**Status: D18 remains NOT READY TO IMPLEMENT.** The controlled Google sign-in evidence could not be collected in this session. The reasons are in section 1. Everything in section 4 is from the local stack and repository only.

Scope: local Supabase stack at `127.0.0.1` (Auth `gotrue v2.197.0`, database host port `54322`). No hosted project was contacted. No secret was printed or stored. No migration was run, and migration `0004` is unchanged.

## 1. Google sign-in evidence: NOT TESTED (blocked)

| Item | Status | Why |
|---|---|---|
| Google Cloud project and OAuth client | **Missing** | No `gcloud` CLI on this machine, no Google-related environment variables, and no Google provider block in `supabase/config.toml`. I cannot create an OAuth client from here. |
| Owner sign-in with a Gmail account | **NOT TESTED** | Needs a Google sign-in performed by you, and an OAuth client. |
| Workspace account and `hd` claim | **NOT TESTED** | Needs a Workspace account you control. None was identified. |
| `email_verified` JSON type | **NOT TESTED** | No real Google identity exists yet. |
| `identity_data.email` vs `auth.users.email` | **NOT TESTED** | Same reason. |
| Multiple Google identities per account | **NOT TESTED** | Same reason. |
| Stale identity after an email change | **NOT TESTED** | A Gmail primary address generally cannot be changed, so this needs a supported test account. |

**Needed from you to unblock:**
1. An OAuth client ID and secret for a Google Cloud project you own, with the redirect URI `http://127.0.0.1:54321/auth/v1/callback`. Or an instruction to create one yourself.
2. You to sign in with your Gmail account through the local Auth endpoint. I cannot enter your Google password.
3. A Workspace test account, if you want the `hd` test. Otherwise it stays NOT TESTED.

## 2. Verified local facts (read-only)

| Fact | Evidence |
|---|---|
| Auth version: `gotrue v2.197.0` | `docker inspect supabase_auth_aqs-platform` image tag |
| Auth health: HTTP 200 | `GET http://127.0.0.1:54321/auth/v1/health` |
| Database host port: `54322` | `docker port supabase_db_aqs-platform` (5432 inside container) |
| Containers healthy | `db`, `auth`, `kong`, `inbucket`, `pg_meta` healthy; `rest` running |
| `auth.identities` columns | `provider_id` text, `user_id` uuid, `identity_data` jsonb NOT NULL, `provider` text, `email` text (**generated**: `lower(identity_data ->> 'email')`), `id` uuid, timestamps |
| Client roles cannot read `auth.identities` | `has_table_privilege`: `anon` f, `authenticated` f, `service_role` f |
| Auth tables not granted to client roles | `information_schema.table_privileges` for `anon`/`authenticated` in schema `auth`: 0 rows |
| API schema exposure | `supabase/config.toml` line ~19 `schemas = ["public", "graphql_public"]` (no `auth`) |

## 3. Baseline pgTAP run (existing suite, not modified)

`supabase test db`: **Files = 5, Tests = 297, Result: FAIL (5 failed).**

| File | Failed tests | Detail |
|---|---|---|
| `010_profiles_platform_admins` | 55, 68 | Audit rows show `AQS Owner (local API test)` instead of the expected test owner. Audit contains `grant` where `revoke` is expected. |
| `020_organizations_memberships` | 20, 96 | `PA can see all organizations` returns 5, expected 3. Audit contains extra `invitation.*` rows. |
| `030_invitations` | 34 | `a Platform Admin sees all invitations` returns 13, expected 11. |

**Likely cause (inference, not yet proven):** the local database still contains rows from an earlier run of the API test script, which leaves persistent test data (its header says so). These tests assume a fresh database. A clean run needs `supabase db reset`, which **deletes local data and re-applies migrations**. That needs your explicit approval.

These failures are not caused by a migration change in this session. They are test-isolation issues on a dirty database.

## 4. Validation of `accept_invitation` and `preview_invitation` against the approved D18 policy

Code references are to `supabase/migrations/20261021180000_0004_invitations.sql`.

| Policy requirement | Current behaviour | Result |
|---|---|---|
| Gmail requires verified Google evidence | No check of any identity or `email_verified` (accept lines 294–297; preview line 249) | **FAIL (not implemented)** |
| Workspace requires verified evidence and a matching `hd` | No `hd` check anywhere | **FAIL (not implemented)** |
| External-address Google accounts are ineligible | No provider or domain check | **FAIL (not implemented)** |
| Missing, contradictory or unsupported evidence fails closed | No evidence is evaluated, so there is nothing to fail closed on | **FAIL (not implemented)** |
| Google identity email must match current account email | Only the account email is compared (`caller_auth_email()`, lines 127–134) | **FAIL (not implemented)** |
| Case-insensitive comparison only; no dot, plus, `googlemail.com` or alias normalization | `lower(btrim(...))` at lines 133, 148, 249, 295. No dot or alias logic. | **PASS** |
| Accept refuses an email mismatch | Lines 295–297; tests `030` lines 167–168 (wrong recipient refused) | **PASS** |
| Preview must not disclose protected information when verification fails | Preview returns `organization_name` and `role` for any signed-in caller holding the token, with `email_matches = false` (line 249). Test `030` lines 162–163 confirm the row is returned. | **FAIL (disclosure)** |

**Disclosure detail:** a signed-in person who holds an invitation link but is not the invitee learns the organization's name and the invited role. Under the approved policy this should not happen when verification fails.

## 5. Stale identity and multiple identities

Both are **NOT TESTED**. Both need a real Google identity. Until then the policy's fail-closed rule is the only protection. It has not been implemented.

## 6. Remaining blockers (precise)

1. **Google OAuth client:** client ID and secret from a Google Cloud project you control, plus the redirect URI in section 1 (or permission for me to create one).
2. **Owner Google sign-in:** you perform the sign-in. I need your Gmail account and, if available, a Workspace account.
3. **Clean database for tests:** `supabase db reset` approval, to clear residue from the earlier API test run.
4. **Implementation of the Google identity check** in a new migration `0005` (needs the evidence above, then your approval).
5. **Preview disclosure fix:** `preview_invitation` should return the organization name and role only when the verified-email check passes. This is part of migration `0005`.

## 7. Proposed migration `0005` (specification only; not implemented)

- New file, `0004` unchanged.
- Private helper `private.caller_verified_google_email()`:
  - returns the caller's lower-cased email only when `auth.uid()` has a `google` identity where `identity_data -> 'email_verified'` is the JSON boolean `true`, `identity_data ->> 'email'` equals `auth.users.email` (case-insensitive), and the domain is Gmail, or Workspace with `hd` present and equal to the domain.
  - returns nothing otherwise (fail closed). It uses only `auth.identities` and `auth.users`, never user-editable metadata.
- `accept_invitation`: refuse unless the helper's email equals the invitation email. Keep the existing self-invitation, inviter-authority and suspended-organization checks.
- `preview_invitation`: return rows only when the helper passes. Otherwise return no rows, so no organization name or role is disclosed.
- Helper grants revoked from `public`, `anon`, `authenticated`, `service_role` (pattern from `0004` lines 352–355).
- Tests: synthetic identity rows for logic only; controlled Google evidence is the only proof of real provider behaviour. The clean-database run must come first.

**Approval needed before migration `0005` is written or applied.**

## 8. Actions that need your approval

1. Google OAuth client details (or permission to create one) and your sign-in.
2. Config change `[auth.external.google]` and a stack restart (`supabase stop` keeps data; `--no-backup` is not to be used).
3. `supabase db reset` to clear residue (deletes local data).
4. Migration `0005` implementation and its application.
5. Any Git commit or push (none has been made).
