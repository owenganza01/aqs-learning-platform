# D18 security review and migration 0005 preparation (22 Oct 2026)

**Status: D18 is NOT READY TO IMPLEMENT.** The Google identity evidence is still NOT TESTED. Nothing here is implemented or applied. Migration `0004` is unchanged. No migration was run, and no database was reset or modified.

Scope: local stack only (`127.0.0.1`, database host port `54322`, Auth `gotrue v2.197.0`). Read-only queries and file review only.

---

## 1. Priority 1: invitation preview security

### 1.1 What `preview_invitation` returns (verified by reading)

`supabase/migrations/20261021180000_0004_invitations.sql`, lines 236–257.

- Caller must pass `private.require_active_user()` (line 244). Anonymous callers are refused; the grant is to `authenticated` only (lines 364–369). Test `030` lines 264–267 confirm anon is refused.
- The token must be 32–200 characters (line 245). Lookup is by SHA-256 hash (line 252).
- The row must be `pending`, not expired, and the organization must not be suspended (lines 253–255).
- **Then the row is returned with four fields (line 249):** `organization_name`, `role`, `expires_at`, and `email_matches`.
- **There is no email check that gates the row.** `email_matches` is a column; it does not filter.

### 1.2 Who can obtain the information

| Caller | Obtains |
|---|---|
| Anonymous | Nothing (refused by `require_active_user`) |
| Signed in, active profile, **does not hold the token** | Nothing (token is random, 32+ characters, hashed; no enumeration path found) |
| Signed in, active profile, **holds the token, email does not match** | **Organization name, role, expiry, and `email_matches = false`** |
| Signed in, active profile, **holds the token, email matches** | Same fields, `email_matches = true` |

Proof of the mismatch row: test `030` lines 161–163 switch to user `c1` (the outsider, who is not the invitee) and expect a row whose `email_matches` is `false`. A row is returned, so the organization name and role come back in that same row. The test checks only the boolean, which is why the disclosure is not caught.

### 1.3 Tenant isolation and token security

- **Disclosed:** organization name (tenant identity), invited role, and invitation expiry, to anyone who holds the link.
- **Not disclosed:** member lists, other invitations, the invitee's email address, token hash, or any other organization's data. Suspended organizations return nothing.
- **Oracle:** a valid pending token returns a row to a non-matching holder, while an unknown token returns nothing. Holding the token already implies you have the link, so this confirms only that the link is still live.
- **Bearer link risk:** a forwarded invitation link lets the forwarder's account learn the organization name and role. That is the disclosure the policy forbids when verification fails.
- **Token strength:** the length check (32–200) does not guarantee randomness. The generator is not yet written (migration 0004, line 21–22 defers it to a later server function). Its entropy must be verified when built. **Not verified.**
- **Related, low severity:** `accept_invitation` returns different messages for "invalid link" (line 282) and "sent to a different email address" (line 296). A token holder can therefore tell that the token is valid. Same root cause as 1.2.

### 1.4 Smallest safe correction (proposed, not applied)

Add the caller-email filter to the `preview_invitation` query, so it returns **no row** unless the caller's account email matches:

```sql
and lower(i.email::text) = private.caller_auth_email()   -- added to the where clause, line ~255
```

- Signature unchanged. `email_matches` becomes always `true` for returned rows. Keep the column so callers do not break; remove it in a later change.
- This closes the disclosure **now**, without waiting for Google evidence.
- **Limit:** it still trusts the unverified account email. The full D18 rule (section 2 of the draft) is required to close the verification gap.

**Tests that change with this correction:**
- `030_invitations.test.sql` lines 162–163: change to expect **no row** for user `c1`, and add an assertion that the organization name is absent.
- `tests/api/invitations.api.test.mjs` line 106: change the expectation from one row with `email_matches === false` to **zero rows**.
- Keep `030` lines 157–158 (invitee gets the row) unchanged.

---

## 2. Priority 2: migration 0005 review

The draft is at `docs/review-artifacts/0005_invitation_verified_email.DRAFT.sql`. It is **outside** `supabase/migrations/` on purpose, so it cannot be applied by accident.

### 2.1 Checked against the actual schema and functions

| Item | Finding | Status |
|---|---|---|
| `auth.identities` columns | `provider`, `user_id`, `identity_data`, and generated `email` confirmed by metadata query | Verified |
| `auth.users.email` | Nullable in Auth. The helper returns no row when it is null, because the comparison is null | Reasoned; test needed |
| `search_path = ''` and qualified names | Used throughout the draft, as in 0004 | Verified (pattern) |
| `security definer` owner | Migration role (postgres locally). Must be able to read `auth.identities` | Verified locally by privilege query (client roles cannot; owner not tested) |
| Client grants | Helper revoked from `public`, `anon`, `authenticated`, `service_role`. Accept and preview granted to `authenticated` only | Matches 0004 section 6 |
| `create or replace` keeps grants | Grants of `accept_invitation` and `preview_invitation` are kept. The draft restates them | Standard PostgreSQL behaviour; confirm after apply |
| `accept_invitation` body | Copied from 0004 lines 260–349. Only the recipient check changes | Diff against 0004 required before any approval |

### 2.2 Edge cases and fail-closed behaviour

| Case | Draft behaviour | Note |
|---|---|---|
| `email_verified` is string `"true"` | Refused | Matches the JSON-boolean rule |
| `email_verified` missing or `false` | Refused | |
| Identity email differs from account email (stale) | Refused | |
| Gmail (`gmail.com`) with verified evidence | Accepted | |
| Workspace with `hd` = email domain | Accepted | |
| Workspace with `hd` missing, or different | Refused | Fails closed |
| `googlemail.com` address | **Refused** | Policy does not list it. **Owner decision** |
| Workspace domain alias (`hd` primary, email on alias) | Refused | Fails closed. Matches "no alias normalization" |
| Case-only difference | Accepted | |
| Dot or `+` tag difference (Gmail) | Refused | Matches "no normalization" |
| Another Google identity on the same account is contradictory | **Refused** (strict) | **Owner decision**: draft chooses strict |
| No Google identity at all (email/password only) | Refused | |
| Null account email | Refused | |
| Token valid but account email unverified | Preview returns nothing; accept refused | |
| Expired, revoked or used token | Unchanged from 0004 | |

### 2.3 Implementation risks

1. **Trusting provider data.** The rule depends on assumptions A1–A3 in the draft header. Each one **fails closed** (refusal). None can produce acceptance on a wrong assumption. This is the reason the draft is safe to prepare.
2. **Entire-function replacement.** `accept_invitation` is replaced in full. A typo would change behaviour silently. Required before approval: a line-by-line diff against 0004 showing only the marked block changed.
3. **SECURITY DEFINER and `auth` schema.** The helper reads `auth.identities` and `auth.users` as the owner. On hosted Supabase this is a supported pattern, but **not verified here**. Verify on the local stack after approval.
4. **No syntax check has been run.** The draft has not been executed, because that would apply it, which is not permitted. A clean-database run is required first (section 3).
5. **Unverified A1–A3** remain the real blocker. The draft cannot be shown to accept the right people until the Google sign-in evidence exists.

### 2.4 Missing tests (to add when 0005 is approved)

- Accept with a verified Gmail identity → succeeds.
- Accept with a verified Workspace identity and matching `hd` → succeeds.
- Accept with `email_verified` string `"true"` → refused.
- Accept with `hd` missing or mismatched → refused.
- Accept with `googlemail.com` → refused.
- Accept with a dotted Gmail variant → refused.
- Accept with a contradictory second Google identity → refused.
- Preview for a non-matching holder → no row (already in 1.4).
- Client roles cannot call `private.caller_verified_google_email()`.
- Client roles cannot read `auth.identities`.

Synthetic fixtures prove **the logic only**. They are not evidence of Google's real `identity_data`. That needs the owner-performed sign-in.

---

## 3. Priority 3: the five database test failures (no reset)

### 3.1 Read-only evidence of residue

Counts on the local database (no row contents read):

| Table | Rows | Expected after a clean run |
|---|---|---|
| organizations | 2 | 0 |
| invitations | 2 | 0 |
| platform_admins | 2 | 1 (test owner, added by the test) |
| profiles | 8 (all `@example.test`) | 0 |
| organization audit rows | 16 | 0 |
| platform-admin audit rows | 2 | 0 |

These rows match the earlier API test script, whose header says its users and data persist in the local database.

### 3.2 Mapping each failure to the residue

| Test | Expected | Actual | Cause |
|---|---|---|---|
| `010` 55 | Audit shows test owner `AQS Owner (test)` | Shows `AQS Owner (local API test)` | Residue platform-admin grant |
| `010` 68 | Revoke follows grant | Grant only | Residue rows shift the sequence |
| `020` 20 | PA sees 3 organizations | 5 | 2 residue organizations |
| `020` 96 | No extra audit rows | `invitation.create`, `invitation.accept` present | Residue invitations |
| `030` 34 | PA sees 11 invitations | 13 | 2 residue invitations |

**Conclusion:** all five failures come from residue. Count-based failures (`020` 20, `030` 34, `010` 55 identity) are confirmed exactly by the counts. Order-based failures (`010` 68, `020` 96) are inferred from the same residue. None points to a defect in the functions themselves.

Each pgTAP file runs inside `begin … rollback` (`030` lines 17 and 297), so the tests do not leave residue themselves. The residue comes from the API script, which commits.

### 3.3 Why targeted cleanup is not an option

Triggers block updates, deletes and truncates on the audit tables (0002 lines 178–180; 0003 lines 165–167). Organizations, profiles, memberships and invitations are never deleted (F8; triggers in 0003 lines 91 and 113, and 0004 line 66). **The only way to reach a clean baseline is to recreate the database.**

### 3.4 What `supabase db reset` would destroy

Everything in the **local** database only, in the `supabase_db_aqs-platform` volume:
- All local auth users, including the 8 test accounts and any future sign-in, including the owner's Google test identity.
- All local profiles, organizations, memberships, invitations, and both audit tables. The audit history is lost by design.
- Then migrations `0001`–`0004` are re-applied. There is no `supabase/seed.sql`, so no seed data is restored.

**It would not touch** hosted Supabase, Google Cloud, Git, the repository, or any file. Storage buckets: none are configured in `config.toml`.

### 3.5 Recommended safe baseline reproduction (needs your approval)

1. **Back up first (writes a file, no database change):** `supabase db dump --local -f <file outside the repo>`. Keep the file outside the repository and out of the archive. Do not print it.
2. **Reset (destructive, local only):** `supabase db reset` from `C:\Dev\aqs-platform`. Requires your explicit approval.
3. **Run the pgTAP suite on the clean database:** `supabase test db`. Expected: **297 tests pass**.
4. **Run the API script only after step 3.** It leaves residue again, so order matters: pgTAP first, then API, and reset again before the next pgTAP run.

Alternative not recommended now: a second database inside the same Postgres container. It needs a database change, and the CLI's `test db` targets the default database, so it would need a custom runner.

---

## 4. Verified facts summary

- Auth `gotrue v2.197.0`; health HTTP 200 (previous report).
- `auth.identities`: `provider`, `user_id`, `identity_data` (jsonb, not null); `email` is generated from `identity_data`.
- Client roles cannot read `auth.identities`; `auth` tables are not granted to client roles.
- `preview_invitation` returns organization name and role to any active signed-in holder of the token, with no email gate.
- Residue counts as in section 3.1; five failures mapped to residue.
- Audit, organization, profile, membership and invitation tables are protected from deletion by triggers.

## 5. Open items and owner decisions

1. **Preview correction now (1.4):** approve the email-filter change in `preview_invitation` and the two test updates.
2. **Strict versus lenient handling of a contradictory second Google identity** (draft section 2.2). Draft is strict.
3. **`googlemail.com`:** refused in the draft, because the policy does not list it. Confirm.
4. **`email_matches` column:** keep it (always true) or remove it in a later change.
5. **Baseline reset:** approve backup and reset (section 3.5).
6. **Google evidence (A1–A3):** still NOT TESTED. Needs your owner-performed sign-in and the OAuth setup from the earlier report.
7. **Applying migration 0005:** not before items 2–6 are resolved and you approve.

## 6. Files created or changed in this review

- **Created:** `docs/d18-security-review-2026-10-22.md` (this file).
- **Created:** `docs/review-artifacts/0005_invitation_verified_email.DRAFT.sql` (review draft; not in `supabase/migrations/`).
- **Unchanged:** migration `0004`, all tests, `supabase/config.toml`, `docs/decisions.md` (owner entry still uncommitted), the preservation archive, and the earlier evidence report `docs/d18-evidence-report-2026-10-22.md`.
- No database object was created, changed or dropped. No Git operation was run.

---

## 7. Owner policy decisions (recorded here, 22 Oct 2026)

These decisions are recorded in this review artifact only. `docs/decisions.md` has not been modified.

1. **Contradictory or unverifiable Google identity evidence: refuse (strict).** Acceptance and preview are refused when the relevant identity evidence is contradictory, ambiguous, or cannot be verified. This covers:
   - another Google identity on the same account that is unverified, or whose email differs from the account email;
   - a Gmail or Workspace identity whose `email_verified` is missing, not the JSON boolean `true`, or whose email is null;
   - a Workspace account whose `hd` claim is missing, unusable, or different from the email domain.
2. **`googlemail.com` is ineligible** under the current policy. Only `gmail.com` (Gmail) and Workspace domains with a matching `hd` are eligible. Any policy amendment needs your explicit approval.

Implementation status: the draft `docs/review-artifacts/0005_invitation_verified_email.DRAFT.sql` already follows both decisions (its `NOT EXISTS` check and `split_part(...) = 'gmail.com'` branch). It has not been syntax-checked and has not been applied.

## 8. Interim preview migration: review

File: `docs/review-artifacts/preview_email_gate.DRAFT.sql` (outside `supabase/migrations/`).

**Diff of the preview function body against `0004` lines 236–257 (read-only comparison):**

| Element | 0004 | Draft | Assessment |
|---|---|---|---|
| Statement | `create function` | `create or replace function` | Required so the existing definition is replaced. Owner and grants are kept. |
| Return type | `table (organization_name text, role public.org_role, expires_at timestamptz, email_matches boolean)` | Identical | Signature unchanged. `create or replace` would fail if it changed. |
| Language, volatility, security, search path | `plpgsql`, `stable`, `security definer`, `set search_path = ''` | Identical | No change in privilege model. |
| `require_active_user()` and token-length guard | Present | Identical | No change. |
| `email_matches` expression | `(lower(i.email::text) = private.caller_auth_email())` | `true` | Correct only because the new filter guarantees the match. |
| Mismatch filter | Absent | `and lower(i.email::text) = private.caller_auth_email()` | Returns no row for a mismatched or null account email. |
| Grants | `revoke … from public, anon, service_role`; `grant … to authenticated` (0004 section 6) | Identical | No new exposure. |

**Security boundary check:**
- A mismatched signed-in user gets no row, so no organization name, role or expiry. The test `030` lines 162–163 (now assertions 38–39) cover this.
- A null account email yields a null comparison, so no row. Fail closed.
- Unknown, expired, revoked, used and suspended-organization tokens still return no row. The result for a mismatched holder is now the same as for an unknown token.
- The token-hash lookup, the anonymous refusal and the `authenticated`-only grant are unchanged.
- Invitee case-insensitive matching is unchanged (`lower()` on both sides). No dot, plus or alias normalization.

**Static validation: NOT possible safely here.** The only real parser for PL/pgSQL is PostgreSQL itself, and it would have to execute `CREATE OR REPLACE` to check the draft. A transaction rolled back would not apply it, but it is still a database operation. I have not run it. I did the textual diff above instead, which confirms only the intended changes. The first real syntax check is the clean-database run after approval (section 10).

**Final proposed steps (for approval, not run):**
1. Confirm approval of the draft SQL.
2. Copy the file into `supabase/migrations/` with a timestamped name later than `20261021180000`, for example `20261022xxxxxx_0005_preview_email_gate.sql`. Keep the header comments.
3. Apply locally only, with `supabase migration up`, after the backup in section 11 is verified.
4. Re-run `supabase test db`. Expect assertions 38 and 39 to pass, and the five residue failures to remain until the database is reset.
5. Hosted environments: out of scope. A separate approval is needed.

**Rollback:** re-apply the `0004` definition of `preview_invitation` (0004 lines 236–257) with `create or replace`.

## 9. Test reconciliation

Results are from `supabase test db` run twice, both times without a reset. Each run rolls back its own data.

| Stage | Tests | Failed | Failed tests |
|---|---|---|---|
| Baseline, before any edit | 297 | 5 | `010` 55, 68; `020` 20, 96; `030` 34 |
| After the test edits | 298 | 7 | the five above, plus `030` 38, 39 |

- **Count check:** `000`=31, `010`=70, `020`=99, `030`=88, `900`=10. Total 298.
- **Failures:** 5 residue + 2 expected = **7**. Earlier I reported "8 failed"; that was a miscount on my part, and there is no eighth failure. The per-file summaries add up: `010` 2 of 70, `020` 2 of 99, `030` 3 of 88.
- **Residue failures (not caused by these edits):** `010` 55 and 68, `020` 20 and 96, and `030` 34. Section 3 of this document has the residue counts.
- **Expected failures (the fix is not applied yet):** `030` 38 (a mismatched user gets a row) and `030` 39 (the organization name is returned, `have: 1`, `want: 0`). These are the regression assertions and should pass after the interim migration is applied.
- **API script:** not run. Its line 106 now expects zero rows for the mismatched holder.

## 10. Backup preparation (procedure only; nothing created)

**Not done yet:** no backup directory, no dump file, and no database change.

**Location:**
- Proposed folder: `C:\AQS-local-backups\`. It is outside the repository, outside `C:\Users\HP\OneDrive`, and outside `AppData` (which Windows redirects for some processes, as seen earlier).
- Before anything is created, confirm that the path is not inside `C:\Dev\aqs-platform` and not inside OneDrive.

**Filenames:** `aqs-local-schema-YYYYMMDD-HHMM.sql` and `aqs-local-data-YYYYMMDD-HHMM.sql`. No hostnames, users or secrets in the name.

**Commands (proposed, to run only after approval, from `C:\Dev\aqs-platform`):**
1. Check that the folder does not already exist: `Test-Path "C:\AQS-local-backups"`.
2. Create it: `New-Item -ItemType Directory -Path "C:\AQS-local-backups"`.
3. Schema dump: `supabase db dump --local -s public,private,auth -f "C:\AQS-local-backups\aqs-local-schema-<stamp>.sql"`.
4. Data dump: `supabase db dump --local --data-only -s public,private,auth -f "C:\AQS-local-backups\aqs-local-data-<stamp>.sql"`.
5. Restrict permissions to your account only.

The CLI's help confirms the flags `--local`, `--data-only`, `--file`/`-f` and `--schema`. Before step 3, run `supabase db dump --dry-run` to see the exact `pg_dump` command. It will show whether `-s` covers all the schemas needed.

**Verification (after the dumps exist):**
1. **Existence and size:** both files exist and are non-zero.
2. **Hashes:** record a SHA-256 for each file in a small text note beside them.
3. **Readability:** the files decode as UTF-8 without errors, and the last statement is complete (no truncated line).
4. **Schema completeness:** the schema file contains `CREATE TABLE` statements for `public.invitations`, `public.organizations`, `auth.users` and `auth.identities`, and the `private` audit tables.
5. **Data completeness:** for each `COPY … FROM stdin;` block in the data file, the number of rows before the `\.` terminator must equal a read-only `count(*)` of the same table on the live database. Any mismatch means the dump is incomplete.
6. **Restore test:** not done in this step. A restore would create a database, so it needs its own approval.

**Sensitivity:** the data dump contains password hashes for synthetic accounts, and it will contain provider data for any real Google sign-in. Keep it restricted and do not copy it into the repository or the archive.

## 11. Git status and files changed in this step

```
 M docs/decisions.md                          (your owner entry, uncommitted, unchanged in this step)
 M supabase/tests/database/030_invitations.test.sql   (regression assertions, plan 87 → 88)
 M tests/api/invitations.api.test.mjs         (line 106 expectation)
?? docs/archive/
?? docs/d18-evidence-report-2026-10-22.md
?? docs/d18-security-review-2026-10-22.md    (sections 7–11 added in this step)
?? docs/review-artifacts/                    (0005 draft and preview_email_gate draft)
```

- Migration `0004`: unchanged.
- No migration applied, no reset, no backup created, no hosted or Google change, no Git staging, commit, fetch or branch change.
- HEAD: `3a0b58b0597ae9772d6b41a6441dbb4ea6695e88` on `phase-1-foundations`.

---

## 12. Post-migration status (22 Oct 2026, after `20261022210000_0005_preview_email_gate.sql`)

**Applied locally** with `supabase migration up --local`. File content is identical to the reviewed draft (SHA-256 check). Local migration list: `0001`–`0004` and `20261022210000` applied, none pending.

**Stale header in the applied file.** The file's comment header still says "NOT APPLIED" and "NOT IN supabase/migrations/". It was deliberately **left unchanged**: an applied migration should not be edited, even for comments, so that the file matches what was reviewed and applied. This section is the status record instead. The executable SQL is unaffected.

**Migration `0004`:** unchanged (no diff against HEAD).

**Test 34 residue (13 versus 11 invitations).** The two extra invitations are from earlier runs of the API test script. Both are `accepted` learner invitations:
- `API Org mvi7iu1a`, invitee and admin at `@example.test`
- `API Org mvi7loz6`, invitee and admin at `@example.test`

These two organizations also explain the two extra organizations in test 20. Test 34 will pass only after the database is reset (not authorized).

**Targeted results (non-destructive, each rolls back its own data):**
- `030_invitations.test.sql`: 88 tests, 1 failure (test 34, residue). Regression tests 38 and 39 pass.
- `900_api_exposure.test.sql`: 10 of 10 pass.
- `010` and `020`: not re-run in this step. Each had two residue failures before.

**Not claimed:** the full suite passing. The API script has not been run against the current database.

**Google sign-in: owner action required** (no evidence yet; all Google identity checks remain NOT TESTED):
1. In a Google Cloud project you control, configure the OAuth consent screen (External, Testing) and add your own Gmail (and a Workspace test account, if used) as a test user.
2. Create an OAuth client of type Web application, with the authorized redirect URI `http://127.0.0.1:54321/auth/v1/callback`.
3. Set two Windows user environment variables yourself, without pasting the values into chat: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. Then tell me they are set (no values).
4. Approve the config change (a `[auth.external.google]` block using those variables; `skip_nonce_check` kept `false` unless a documented technical need appears) and the stack restart.
5. Sign in once with your Gmail account at `http://127.0.0.1:54321/auth/v1/authorize?provider=google`. I will then read only key names and JSON types for your own identity row.
