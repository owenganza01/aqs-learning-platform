# P10: independent security and tenant-isolation review

**Date:** 20 November 2026
**Code reviewed:** `integration` at `50b9d0d`
**Task:** Q-7 in `docs/progress/task-sheet.xlsx`: "Independent security and tenant-isolation review of the cycle's changes (fresh reviewer). Done when: no open high or medium findings. Evidence: review notes. Include the pack section 9.3 finding."
**Method:** I read every database function, grant and Edge Function path the cycle added, against D21, D27, D31, D33, D39, D40, P19 and F8. I checked each claim against the repository tests named below. Nothing was run against staging or production, and no database test was run. Every finding is **repository evidence**, unless it is marked as needing a staging check.

## 1. Scope and independence

| In scope (written by Owen, reviewed here) | Where |
| --- | --- |
| Migration 0020: YouTube check actor | `supabase/migrations/20261110120000_0020_youtube_check_actor.sql` |
| Migration 0021: workspace requests and organisation profile | `…0021_organization_data.sql` |
| Migration 0022: email domains and admission | `…0022_organization_domains.sql` |
| Migration 0023: learning summaries | `…0023_learning_summaries.sql` |
| Edge Functions `organisation-request`, `domain-verify`, `youtube-verify` (caller session), and the `media-url` kinds | `supabase/functions/` |
| The frontend data paths that call them | `src/live/data/domains.ts`, `summaries.ts`, `SessionProvider.tsx` |

**Not in scope, because the reviewer wrote it:** the frontend refinement in #35–#43 (Assignments 1–3, Handoff 2 F1–F3 and Phases A–C). Those PRs change no database function, grant or Edge Function. An independent reviewer still needs to cover them, for example ChatGPT's review.

## 2. Summary

| Severity | Count | Findings |
| --- | --- | --- |
| High | 0 | — |
| Medium | 1 | M1 |
| Low | 4 | L1–L4 |
| Information | 3 | I1–I3 |

**The exit criterion "No open high or medium findings" is not met yet.** M1 is open. The fix is small and sits in one Edge Function (section 5). It needs a separate PR (P11) and Owen's authorisation to redeploy.

## 3. What holds (tenant isolation and access)

Each item was checked in the SQL. The test that proves it is in brackets.

1. **No client can read or write the new private tables.** These are `organization_domains`, `domain_admission_attempts`, `organization_requests`, `organization_request_attempts` and `organization_profiles`. Every right is revoked from `public`, `anon`, `authenticated` and `service_role` (096, 095, 900).
2. **Every new function is `security definer` with `search_path = ''`.** Each checks the caller before reading anything. `anon` can execute none of them (900).
3. **The cross-organisation rules hold:**
    - `organization_domains(org)`: Platform Admins, or that organisation's Org Admins through `authz.has_org_role`. The token is shown only to Platform Admins.
    - `set_domain_admission_paused`: gives the same refusal for an unknown domain and another organisation's domain, so it discloses nothing (096, section 3).
    - `organization_profile`: Platform Admins and that organisation's Org Admins.
    - `org_learning_summary`: that organisation's Org Admins only; Platform Admins are refused (P19) (097).
    - `course_learning_summary`: returns rows only for courses the caller is staff of, or Org Admin of; other ids give no row (097).
4. **Suspended organisations grant nothing.** `authz.has_org_role` (0003) requires an active membership, an active profile and an active organisation (a draft one only for Org Admins and Instructors). So a suspended organisation's admins can't read domains, pause, or read summaries.
5. **Admission (D40):**
    - The address comes only from `private.caller_verified_google_email()` (D33). The function takes no arguments.
    - Every refusal returns the same `not_eligible`.
    - Admission needs a verified, enabled, unpaused domain that exactly matches, in an active organisation.
    - An existing membership is never changed, and a removed or suspended one is never reactivated.
    - It gives the Learner role only, with no enrolment, and writes one audit row.
    - A per-person advisory lock makes the rate limit hold under concurrency (096, concurrency check).
6. **Nobody can verify a domain by claiming it:**
    - Verification results are written only by `record_domain_verification`, which only `service_role` can execute.
    - It re-checks that the actor is an active Platform Admin.
    - The actor and the expected TXT value come from `domain_verification_target`, read as the caller. The DNS outcome is decided in the function from the resolver's answer. The request body carries only `domainId` and `enable` (`domain-verify/verify.test.mjs`).
    - Enabling admission requires a `found` result from that same check (D31).
7. **`media-url`:** every kind is resolved by a database function called as the caller before anything is signed. The secret key only signs a path the database returned. Signed URLs last 15 minutes (`kinds.test.mjs`).
8. **Counts only (P19, 7-1):** 0023 returns counts per course, with no names, IDs, emails or time series. Org Admins and course staff already see each learner's progress through `course_learners`, so a small count discloses nothing new.
9. **No new dependence on `service_role` table rights.** Every service-role path in the cycle goes through a `security definer` function (`submit_organization_request`, `record_domain_verification`). They work on staging, where the service role has no read or update rights on app tables (see L4).

## 4. Findings

### M1 (Medium). The workspace-request rate limit can be bypassed with a forged `X-Forwarded-For`

- **Where:** `supabase/functions/organisation-request/request.ts`, `callerAddress()`. Its unit test (`request.test.mjs`, "the caller address is the first forwarded entry") fixes the behaviour.
- **What:** the limit of 5 stored requests an hour and 20 a day is keyed on a salted hash of the **first** `X-Forwarded-For` entry. A proxy appends the address it saw to the right of that header, so the first entry is whatever the client sent. A script can send a new made-up address on every request and is never limited.
- **The other two defences are bypassable too.** The honeypot and the 4-second minimum fill time stop only naive bots. A script leaves `company_fax` empty and sets `started_at` 5 seconds in the past.
- **Impact:** the request queue and `private.organization_requests` can be flooded. That fills Platform Admins' queue and stores unlimited unsolicited contact data (L6 retention is undecided). Tenant data is not exposed.
- **Needs a staging check:** whether Supabase's edge keeps or replaces a client-sent `X-Forwarded-For`. If it replaces it, M1 drops to Low. Check: one request to `organisation-request` on staging with a forged header, then read the stored `ip_hash` count. That needs Owen.
- **Fix (P11):** key the limit on the address the platform itself sets. That is `cf-connecting-ip` when present (Cloudflare overwrites it), otherwise the **last** `X-Forwarded-For` entry, which the platform's own proxy appended. Change the unit test to match: this changes what an existing assertion checks, so it needs Owen's approval. Optionally add a global cap, for example a maximum number of new requests per hour across all callers, so that no header trick can flood the queue.

### L1 (Low). The workspace-request limit counts only stored requests, and isn't safe under concurrency

- **Where:** `public.submit_organization_request` (0021).
- **What:**
    - The attempt row is inserted only after every field passes validation, so rejected submissions are never counted.
    - Two simultaneous calls from the same hash can both read a count of 4 and both store. This is the race that 0022 closes with `pg_advisory_xact_lock`; 0021 has no lock.
- **Impact:** a few extra requests above 5 an hour per hash. It matters less than M1.
- **Fix (P11, needs a migration and Owen's SQL approval):** take the same per-hash advisory lock as 0022. Can wait until a later migration is needed anyway.

### L2 (Low). A Platform Admin can record a YouTube check without a lookup

- **Where:** `public.record_youtube_check` (0020), executable by `authenticated`, with the check that the caller is a Platform Admin.
- **What:** since 0020 the check is recorded with the admin's own session. A Platform Admin can therefore call the function directly with `outcome = 'found'` and `channel_match = true`, with no YouTube lookup behind it. `attach_verified_youtube` then accepts it for 10 minutes.
- **Why it's Low:** D39 makes the lookup a technical signal, and the Platform Admin is the reviewer who attests the step anyway. The record names them (0020's purpose).
- **Note:** 0022 chose the opposite design for domains (service role only, actor passed in and re-checked). If AQS wants the YouTube signal to be unforgeable too, 0022's pattern is the one to copy. That would be an owner decision, not a defect.

### L3 (Low). `course_learning_summary` accepts an array of any length

- **Where:** 0023, `course_learning_summary(p_courses uuid[])`.
- **What:** a signed-in caller can send a very large array. The function filters to visible courses, so nothing leaks, but the query cost isn't bounded.
- **Fix (later migration):** refuse more than, say, 200 ids. The frontend sends one id per course the instructor teaches.

### L4 (Low; the carried 9 Nov finding, pack 1 section 9.3). The test database is more permissive than hosted Supabase

- **Where:** `scripts/db-sandbox/supabase-shim.sql`, lines 39–41 and 134.
- **What:**
    - The stand-in grants `all` on future `public` tables, sequences and functions to `anon`, `authenticated` and `service_role` by default privileges, and `all` on `storage.objects` and `storage.buckets`.
    - On staging the service role has no read or update rights on the app tables.
    - The migrations revoke explicitly, so the pgTAP results hold. But a sandbox test can pass for a service-role path that would fail on hosted Supabase.
    - 0012 keeps `UPDATE` on `profiles` for `service_role` for the undecided F8/R4 anonymisation route. On staging that right isn't there, so **that route must not assume it.**
- **Status:** still open. Nothing in this cycle depends on it (section 3, item 9).
- **Fix (P11):** match the stand-in's default privileges and service-role grants to hosted defaults, then run the database suite. Running it needs Owen's permission for `npm run test:db`, which isn't granted for my assignments. Record in the F8/R4 decision that anonymisation goes through a `security definer` function.

### Information

- **I1:** in `supabase/functions/_shared/http.ts` the comment on `adminClient()` says "for signing Storage URLs only (media-url)". `domain-verify` and `organisation-request` now also use it for one RPC each. Comment only.
- **I2:** an Org Admin can resume a pause that a Platform Admin set, because both use `admission_paused`. Platform Admins still have `disable_domain_admission`, which Org Admins can't undo. That matches D40, which gives Org Admins pause and resume and Platform Admins disable.
- **I3:**
    - `domain-verify` has no rate limit and sends the domain name to Cloudflare and Google DNS-over-HTTPS. That's acceptable: Platform Admins only, one lookup per click, and accepted in #49's approval checklist item 3.
    - DNS answers aren't DNSSEC-checked by AQS; the resolvers validate. A TXT record on `_aqs-verification.<domain>` proves control of that DNS zone, which is D31's standard.

## 5. Proposed P11 work from this review

| # | Finding | Change | Needs |
| --- | --- | --- | --- |
| 1 | M1 | `callerAddress()` uses `cf-connecting-ip`, then the last `X-Forwarded-For` entry; unit test updated; optional global cap | Owen's approval of the changed assertion; a `organisation-request` redeploy (owner) |
| 2 | L4 | Stand-in defaults aligned with hosted Supabase | Permission to run `npm run test:db` |
| 3 | L1, L3 | Advisory lock in `submit_organization_request`; array cap in `course_learning_summary` | A new migration and Owen's SQL approval; can wait |
| 4 | I1 | Comment fix | — |

**Re-review:** once M1 is fixed, and confirmed or downgraded on staging, the exit criterion is met. The code reviewed here must also be what is frozen for P9.
