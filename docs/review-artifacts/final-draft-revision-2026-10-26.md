# Final draft revision — 26 October 2026

> **Consistency correction, 26 October 2026 (later the same day):** the draft function
> that gave Platform Admins routine access to Organization Admins' names and email
> addresses was removed (owner direction on Q-L11-2). The L11 P1 membership-row rule is
> unchanged. New results: `evidence-2026-10-26/test-runs-correction.txt`.

This revises the existing drafts, following the direction approved by the owner on
26 October 2026: ChatGPT's consolidated recommendations, **for draft work only**. It
updates `final-review-package-2026-10-26.md`; where the two differ, this file is newer.
No migration, database, configuration file, decision record or Git state was changed.

## 1. Issues fixed in the drafts

| # | Issue | Fix | Regression evidence (simulated, PostgreSQL 16) |
|---|---|---|---|
| 1 | **X-1:** the course's proposer could approve a preview a colleague requested (P2) | `approve_lesson_preview` now refuses the course's publication proposer as well as the preview's requester. It is allowed only while a publication request is pending. Withdrawing or declining the request clears preview approvals. `approve_course_publication` refuses any preview approved by the proposer (second layer). | 050 tests 82–87 (6 new). The pre-fix function (fault F9) fails 82–83. The original probe is now refused: "the person who proposed the course cannot approve its previews (P2)". |
| 2 | **P7** not implemented | `public.organization_members(p_org)` in 0006 §9. Only an Organization Admin of that organization (not suspended) may call it. It returns active members' names, emails, roles and membership date. Removed, suspended and deactivated members are excluded, and non-members (public learners) can never appear. No change to `profiles` row rules. | 042 tests 1, 2, 10, 15–21, 23. Fault F11 (inactive members listed) fails 15. |
| 3 | **L11 P1** not implemented for memberships | 0006 §8. Platform Admins read only active Organization Admin membership rows (person IDs only), and only the `org_admin` role row of each. Helper `authz.platform_admin_sees_membership` answers false to everyone else. **No routine access to names or email addresses** (owner direction on Q-L11-2, 26 October 2026; case-specific access uses the audited lookup, P15). An earlier draft function giving Platform Admins those names and emails was removed in the consistency correction. | 042 tests 5–14, 22; 020 copy test 21. Fault F10 fails 042 #5 and #22, and 020 #21. |
| 4 | **Audit wording** (L11 P2 vs P15) | Draft comments now state: "completed support lookups are audited; refused attempts return an error". Case-reference and reason requirements are unchanged. A new test shows authorization is checked before any input is examined. | 040 test 15 (non-Platform Admin with blank inputs gets 42501, not a validation message). Refusals still write nothing (040). |
| 5 | **Migration order** | `migration-plan-2026-10-26.md`: 0005a T4 → 0005b P12 → 0006 → 0007 → 0008 → 0009–0011, with filenames and dependencies. Each draft's header names its intended file. | Full chain 586/586; stages 307 and 399 (after the consistency correction). |
| 6 | **P12 test setup** | Every later fixture records an accepted org_admin invitation before activating (test-only helper `pg_temp.p12_accept`). P12-stage copies of 020 and 030 were added. 040 keeps its organizations as drafts. Three invitation counts in the 030 copies rise by the fixture row, labelled in each test description. No other assertion changed. | R2 and R5 runs |
| 7 | **service_role least privilege** (new tables) | 0007 and 0008 now revoke **all** privileges on their tables (and the view) from `service_role`, instead of writes only. | 050 test 4, 060 test 3. Fault F12 fails both. |
| 8 | **Redirect port mismatch** (X-6) | Proposed only: `config/config.toml.PROPOSED.diff`. It sets `site_url` and the redirect allow-list to the app's port 5173, and drops `graphql_public` from the API schemas (T4). `supabase/config.toml` itself is unchanged. | Text review only |

## 2. Material checks

**D34 table count.** Inventory of `public` tables after drafts 0006–0008 (catalog query, sandbox):
- **existing:** profiles, platform_admins, organizations, organization_memberships, membership_roles, invitations;
- **0007:** courses, course_staff, course_modules, lessons, lesson_contents, lesson_resources;
- **0008:** enrollments, lesson_progress.

That is **14 tables**. 0009 adds quizzes, quiz_questions, quiz_options, quiz_option_keys, quiz_attempts, quiz_attempt_answers and the explanations table (G8), for **21**. Plan Revision 3 §4.1 lists 21 tables including `audit_events`, so "21 + explanations − `audit_events`" = **21**. D34's "22" is an arithmetic error. The decision record is **not** changed; correcting it needs a separate approved edit. The view `course_instructor_names` and the private audit tables are not counted.

**F7.** `docs/decisions.md` has no F7 entry; D32 records F1–F6 and F8. Plan Revision 3 §11 proposed for F7: "Org admins: name and email; instructors: name only; nobody else". In substance this is covered by approved decisions:
- P7: Organization Admins see active members' emails, never public learners';
- G2: Instructors see names, never emails;
- G1: Organization Admins see members only.

Two later approvals go beyond F7's "nobody else": P6 (public display names of instructors) and L11 P1 (Platform Admins see Organization Admins). **Conclusion:** F7 is superseded by P7, G1, G2, P6 and L11; the drafts implement those. Recording that in the decision record is an owner decision (not done).

**service_role.** The frontend never uses the service key. `src/lib/supabase.ts` reads only the URL and the publishable key, and `.env.example` warns against adding a service key. A repository scan found key-like content only in `supabase/.temp/start-secrets/…/docker.env`. That file is written by the Supabase CLI for its local Edge Functions runtime; it is ignored by `supabase/.gitignore`, untracked, and in no local commit. It was not opened. Privileges:
- **0007 and 0008 tables:** none (fixed above).
- **Earlier tables** (catalog audit): `service_role` keeps SELECT, REFERENCES and TRIGGER on organizations, organization_memberships, membership_roles and invitations, and also UPDATE on profiles. It bypasses row rules. Nothing approved needs this: T6's invitation Edge Function should call database functions with the caller's own token.

  Proposed SQL for a later approved migration (not in any draft):
  ```sql
  revoke all on public.organizations, public.organization_memberships,
                public.membership_roles, public.invitations from service_role;
  revoke select, update, references, trigger on public.profiles from service_role;
  ```
  Whether anonymization (F8, R4) will need a service-role path is undecided, so this stays a proposal.

**Redirect port.** `vite.config.ts` sets no port, so the dev server uses Vite's default, 5173. Playwright uses 5180. `config.toml` points `site_url` at `http://127.0.0.1:3000` and allows `https://127.0.0.1:3000`, which no local server provides. The proposed diff fixes this. Before O1 the owner must apply it (with approval) and register the local callback `http://127.0.0.1:54321/auth/v1/callback` in the Google OAuth client.

## 3. API test review

`0006/api/invitations.api.test.DRAFT.mjs` was reviewed against the current drafts and extended with L11 P1 and P7 checks. **It has not been run.** No PostgREST or GoTrue server, and no local Supabase stack, was available in the review environment:
- Docker image downloads are blocked;
- no PostgREST package is available (the Python package `postgrest` is a client library);
- GitHub release downloads are refused.

`node --check` passes.

Points the owner-run execution must confirm:
1. Local HS256 tokens signed with the local JWT secret are accepted.
2. `postgres` may insert synthetic rows into `auth.users` and `auth.identities` (otherwise use `supabase_admin`).
3. `/graphql/v1` errors after 0005a.

The existing `tests/api/invitations.api.test.mjs` still cannot run under the approved email sign-up setting (X-7).

## 4. Tests run (all simulated: PostgreSQL 16.15 sandbox in the cloud workspace, not Supabase)

| Run | Applied | Result |
|---|---|---|
| R1 | 0001–0005; unchanged tests | 298/298 |
| R2 | + 0005a, 0005b; P12 copies | 307/307 |
| R3 | through 0006; 0006 copies | 399/399 (was 400 before the consistency correction) |
| R4 | through 0007; 050, 900 | 122/122 |
| R5 | full chain; every final copy | **586/586** (was 587 before the consistency correction) |
| F1–F12 | full chain + one deliberate fault each | every fault caught (names and test numbers in `evidence-2026-10-26/test-runs-revision.txt`) |
| Probe | X-1 scenario | refused as intended |

**Not run:**
- both API test scripts;
- anything on real Supabase, PostgreSQL 17, Google OAuth, REST, GraphQL, Storage or Edge Functions;
- concurrency and performance;
- T2 and T11.

## 5. Decisions still open (not decided by these drafts)

- **Implemented as recommended; please confirm:**
  - Q-P12-1: only accepted invitations count;
  - Q-07-9: "proposer" in P2 covers both the preview's requester and the course's proposer;
  - Q-L11-2: settled by owner direction (26 October 2026): no routine Platform Admin access to Organization Admins' names or emails; the draft function was removed.
- **0006:** Q-06-1 (message order), Q-06-2 (limits 100/1000/50).
- **0007:** Q-07-1, Q-07-2, Q-07-4, Q-07-5, Q-07-6, Q-07-7, Q-07-8, Q-07-10, Q-07-13.
- **0008:** Q-08-1 to Q-08-5.
- **Later migrations:** Q-09-1, Q-10-1.
- **Records and order:**
  - the T1 amendment for the order in `migration-plan-2026-10-26.md`;
  - correcting D34's table count (21);
  - recording that F7 is superseded;
  - recording the reconciled audit wording beside L11 P2;
  - service_role revocation on 0002–0004 tables.
- **Technical suggestions not applied** (documented in the final review package): Q-06-4 (`actor_id`), Q-07-11, Q-07-12, Q-07-14, Q-08-7.
