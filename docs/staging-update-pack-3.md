# Staging update pack 3 (P8, test-website update 3)

**Prepared:** Friday 20 November 2026, from `integration` at `d2d5995`
**Status:** **prepared only.** Nothing in this pack has been run. Every step marked **Owen** needs Owen's explicit authorisation for that step, given at the time. The preparer runs no step that touches staging.
**Purpose:** bring the test website up to the merged P3, P4 and P5 work: company-email domains and admission (D40), and the dashboard learning summaries (7-1, 7-3, 7-4).

**Scope and limits:**
- Staging only (`aqs-staging`, project `txpaszokduxewyojrnmq`; Render `aqs-learning-staging`), synthetic "ZZ" data only (OD15).
- Supabase project `eeoofujuouquhnxkpffs` is not touched. No production, no real data, no paid service.
- Never `supabase link`, never `supabase db push`, never Docker Desktop (`docs/staging-runbook.md`).

---

## 1. What changes

Everything below was merged into `integration` after test-website update 2 (#47, `cf186e2`).

| Item | Source | Kind | Rollback |
| --- | --- | --- | --- |
| Migration 0022 `20261118120000_0022_organization_domains.sql` | #49 (P3, 4-0 to 4-3) | 2 tables in `private`, 4 helpers, 8 functions | `supabase/rollbacks/0022_organization_domains.rollback.sql` (drops domain rows and tokens; keeps memberships and audit rows) |
| Migration 0023 `20261119120000_0023_learning_summaries.sql` | #50 (P5, 7-1) | 2 read-only functions, no table, no stored data | `supabase/rollbacks/0023_learning_summaries.rollback.sql` (no data lost) |
| Edge Function `domain-verify` (new) | #49 (4-3) | DNS TXT check for Platform Admins | Delete the function in the dashboard (nothing stored outside the database) |
| Frontend | #50, #51, #52 (P4, P5) | Domain screens, admission after sign-in, menu label, dashboard charts | Render "Rollback" to the update 2 deploy (`a5d584e`) |

**Not changing:** no other migration, no other Edge Function (`invitations`, `media-url`, `storage-cleanup`, `youtube-verify` and `organisation-request` are unchanged since `cf186e2`), no new secret, no Render environment variable, no Supabase Auth setting, `VITE_AUTH_PROVIDERS` not added.

**Configuration in the repository:** `supabase/config.toml` adds `[functions.domain-verify] verify_jwt = false`, the same as every other function: it checks the caller's session itself. On a hosted project the dashboard setting is what counts (step 4 check).

## 2. Evidence before the update

| Check | Result | Label |
| --- | --- | --- |
| CI on `d2d5995` (lint, build, unit, database suite, rollback check, browser suites) | success | Verified, CI |
| lint, build, `check:build` (99 files) on `d2d5995` | pass | Verified, local |
| `test:unit` / `test:functions` on `d2d5995` | 70/70, 53/53 | Verified, local |
| `check:functions` (Deno, all 6 functions incl. `domain-verify`) | pass | Verified, local |
| Database suite, 096 (68) and 097 | reported in #49 and #50; run again by CI on `d2d5995` | Verified, CI and sandbox (not hosted Supabase) |
| Rollback check incl. 0022 and 0023 | in CI on `d2d5995` (`scripts/db-sandbox/rollback-check.sh`) | Verified, CI sandbox |
| Concurrency check of admission | 11/11, six runs (#49) | Reported, sandbox |
| Promotion `integration` → `feature/first-release` | not a fast-forward (update 2's merge commit `a5d584e` is only on `feature/first-release`); a merge is clean, 43 files differ | Verified, local (`git merge-tree`) |

**What this does not prove:** that the migrations apply cleanly on hosted Supabase (Postgres 17, real roles); that `domain-verify` reaches the DNS-over-HTTPS resolvers from Supabase's edge; that Render builds and serves the new frontend; that a real Google Workspace sign-in is admitted. Those are the checks in section 5.

## 3. Order and why

**Recommended: 0022 → 0023 → `domain-verify` → frontend.**

Both migrations only add objects; nothing the current frontend (`a5d584e`) calls is changed or removed, so the old site keeps working after each step. The new frontend also tolerates every in-between state (read in the code, `src/live/data/domains.ts`, `src/live/pages/manage/LiveOrgAdminDashboard.tsx`; covered by the mocked browser tests in #51 and #50):

| State | What the new frontend does |
| --- | --- |
| Without 0022 | Admission after sign-in is silently skipped (`claimDomainMembership` treats any failure as "not eligible"; sign-in is never blocked). The domain cards show their error state. |
| 0022 without `domain-verify` | Platform Admins can add, disable and remove domains, but "Verify" and "Turn on admission" fail with an error; nothing can be verified, so nothing is admitted (D31). |
| Without 0023 | The dashboard charts say they cannot be loaded; the rest of each dashboard works. |

The frontend goes last only so that the first time anyone sees the new screens, they work.

0023 does not depend on 0022 (separate objects); the order is timestamp order, as every sandbox and CI run applies them.

## 4. Steps

Each migration is applied as in update 1 and 2: one transaction through the Supabase connection, refusing to continue if that version is already recorded, checking that the statements match the repository file exactly, then writing the history row in the Supabase CLI's format.

### Step 0. Read-only pre-checks (Owen, or the preparer with Owen's go for read-only access)

| Check | Expected |
| --- | --- |
| Migration history | 0001–0021 recorded (as after update 2); 0022 and 0023 absent |
| `private.organization_domains`, `public.org_learning_summary` exist? | No |
| Edge Functions list | `invitations`, `media-url`, `youtube-verify`, `organisation-request` (and their versions); no `domain-verify` |
| Secrets (names only) | `ALLOWED_ORIGINS` set and includes `https://aqs-learning-staging.onrender.com` |
| Security advisors | Record the error and warning counts as the baseline |
| Render live deploy | `a5d584e` |

If any answer differs, **stop and record it.**

### Step 1. Migration 0022 (Owen)

| Check after | Expected |
| --- | --- |
| History | 0022 recorded; statements match the file |
| Tables | `private.organization_domains` and `private.domain_admission_attempts` exist; `anon`, `authenticated` and `service_role` have no right on either |
| Functions | 8 new: `add_organization_domain`, `remove_organization_domain`, `disable_domain_admission`, `domain_verification_target`, `record_domain_verification`, `organization_domains`, `set_domain_admission_paused`, `claim_domain_membership`. `anon` can execute none. `record_domain_verification` is executable by `service_role` only |
| Advisors | No new error. New "signed-in function" warnings for the 7 functions callable by signed-in users are expected (by design, as for earlier migrations) |
| Site (old frontend) | Still opens; sign-in works |

**Undo:** `psql --single-transaction -f supabase/rollbacks/0022_organization_domains.rollback.sql`. Right after step 1 no domain exists, so nothing is lost.

### Step 2. Migration 0023 (Owen)

| Check after | Expected |
| --- | --- |
| History | 0023 recorded; statements match the file |
| Functions | `org_learning_summary(uuid)` and `course_learning_summary(uuid[])` exist; `anon` cannot execute them |
| Advisors | No new error; 2 more signed-in function warnings |

**Undo:** `supabase/rollbacks/0023_learning_summaries.rollback.sql` (stores nothing; no data lost).

### Step 3. Deploy `domain-verify` (Owen)

```bash
npx supabase functions deploy domain-verify --project-ref txpaszokduxewyojrnmq
```

Run from a checkout of `integration` at `d2d5995` or later. No secret to set: the function reads `SUPABASE_URL`, the keys Supabase provides, and `ALLOWED_ORIGINS`.

| Check after | Expected |
| --- | --- |
| Dashboard → Edge Functions → `domain-verify` → Details | Active; "Verify JWT" **off** |
| `POST` without a session | Refused (401) |
| `POST` with a signed-in non-admin session (synthetic account) | Refused before any DNS lookup |

**Undo:** delete the function in the dashboard. The screens then behave as "0022 without `domain-verify`" (section 3).

### Step 4. Promote the frontend (Owen)

As update 2: open a pull request `integration` → `feature/first-release` and merge it with a merge commit. Render deploys `feature/first-release` automatically. The merge is clean (section 2).

| Check after | Expected |
| --- | --- |
| Render | New deploy live, built from the merge commit |
| Site | Opens; sign-in works; no security-policy errors in the browser console |
| `check:build` boundary | The deployed bundle is the same `npm run build` that passed `check:build` |

**Undo:** Render dashboard "Rollback" to the `a5d584e` deploy. Leaving 0022, 0023 and `domain-verify` in place is safe for the old frontend (section 3).

## 5. Verification on the test website after the update (P9)

Synthetic accounts and "ZZ" organisations only. Results are recorded as **staging evidence**.

| # | Check | Who |
| --- | --- | --- |
| 1 | Platform Admin opens a ZZ organisation, adds a domain; the TXT name `_aqs-verification.<domain>` and value `aqs-verification=<token>` are shown | Owen (Platform Admin session) |
| 2 | A public provider (`gmail.com`, `yahoo.co.uk`) is refused | Owen |
| 3 | "Verify" on a domain without the record answers `not_found`; admission stays off | Owen |
| 4 | Org Admin of that organisation sees the domain without the token; Org Admin of another ZZ organisation does not | Preparer with Owen's synthetic accounts, or Owen |
| 5 | Org Admin is offered no pause or resume while the domain is unverified or admission is off | as 4 |
| 6 | Dashboards: Org Admin and Instructor charts load with counts only; Platform overview shows counts only | as 4 |
| 7 | Every domain action wrote one `private.organization_audit` row (read-only query, counts by action) | Owen |
| 8 | Advisors after the update: no new error compared with step 0 | Owen |
| 9 | Four-role walkthrough (learner, instructor, Org Admin, Platform Admin) and journeys as in update 2 | Preparer and Owen |

**Not testable without an owner decision (blocked):** a real **verified** domain and a real **admission**. Both need a domain whose DNS Owen controls (to publish the TXT record) and a Google Workspace account on that domain (D33: verified Google identity with a matching `hd` claim). Until then, checks 1 to 8 cover the refusals and controls on staging, and the admission itself stays proved in the sandbox only (096, concurrency check). This is recorded as unverified on staging, not as a pass.

## 6. Rollback summary

| Undo | Data lost | Effect on the site |
| --- | --- | --- |
| Frontend to `a5d584e` | None | Old screens; new database objects unused |
| Delete `domain-verify` | None | No verification possible; nothing new admitted |
| 0023 rollback | None | Charts say they cannot be loaded |
| 0022 rollback (after 0023's if both) | Every domain row, token and check result; attempt counters | Admission and domain screens stop; memberships created by admission and all audit rows stay (F8) |

**Backups:** as in update 1, the Free plan has no automatic backup. If any real domain has been verified before a 0022 rollback, export `private.organization_domains` first (Owen).

## 7. Owner actions in this pack

1. Authorise and run steps 1, 2, 3 and 4, each separately.
2. Read-only access for step 0 and section 5 checks 7 and 8, or run them.
3. Decide whether a staging domain under Owen's DNS and a Google Workspace test account will be provided for a real admission check (section 5); otherwise it stays sandbox-only evidence.
