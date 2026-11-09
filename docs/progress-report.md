# Progress report — first release

Branch `feature/first-release`. Status on 2 November 2026: pushed to `origin` up to `4375371` (1 November 2026, owner-authorized); later commits are local until the owner pushes. Staging `aqs-staging`: migrations 0001–0013 applied (0012 and 0013 on 1 November 2026); Edge Functions `invitations` and `media-url` deployed on 2 November 2026 from `4375371` (the hardened versions in `ade1050` are not yet deployed); Render static site live. The "NOT applied" status line in the header of migration 0013 describes 31 October 2026 and are left unchanged (applied migrations are never edited, T1). Current state and next actions: `docs/agent-handoff.md`.

| Milestone | Commit | Result |
|---|---|---|
| M0 Baseline of reviewed frontend and drafts | `dfcbe0d` | — |
| M1–M2 Migrations 0005a–0009 (GraphQL off, P12, identity and invitations, courses, enrolment, quizzes) | `92e3bea` | DB tests 654/654 |
| M3 0009a corrections/revert/clone, 0010 Storage and video, 0011 platform report | `a7ec266` | DB tests 764/764 |
| M4 Live frontend on real data for all four roles; Edge Functions `invitations`, `media-url` | `c94ee2f` | lint, build, 310/310 preview e2e |
| M5 Live-mode e2e (mocked API), CI workflow, Render blueprint, staging runbook | (this commit) | 17/17 live e2e, 7/7 function tests |
| M6 Real-Storage validation (disposable, local/container, not hosted Supabase) | runner committed in `33fa15e` | 74 Supabase Storage tenant migrations + 13 canonical AQS migrations applied; 764/764 pgTAP tests pass (16 files, 0 failures, 0 errors, exit code 0) |

All database results before M6 were **simulated** (PostgreSQL 16 sandbox, not Supabase).
M6 is a separate, later gate: it runs the canonical 13 migrations and the 764 pgTAP tests
against a fresh disposable PostgreSQL 17 / Supabase-Compatible Storage cluster inside a
container with `--network none`. It does not constitute hosted Supabase validation; Google
identity, hosted Auth, PostgREST, and Storage URL/proxy behaviour remain staging gates.
Live-mode UI tests use a mocked Supabase API. Nothing has run against a real hosted Supabase
stack yet: that remains the staging step.

## Promoted but not applied (31 October 2026)

- **Migration 0012** (`supabase/migrations/20261030120000_0012_revoke_service_role_legacy_tables.sql`,
  revoking `service_role` privileges on the older 0002-0004 tables) is now promoted into the
  working tree. Its pgTAP test is `supabase/tests/database/065_service_role_legacy_revocation.test.sql`
  (75 assertions). Both canonical files were promoted byte-for-byte from the validated drafts
  in `docs/review-artifacts/0012/`. Disposable validation only (not applied to any database):
  canonical migrations 0001-0011 plus 0012 applied successfully in a fresh disposable
  PostgreSQL 16.15 cluster, and the canonical runner discovered test 065 automatically; 75/75
  assertions passed with no parse errors. Broad no-0013 regression run: 18 files, 864 tests,
  12 failures in tests depending on migration 0013 (1 in `050_courses.test.sql`, 11 in
  `055_public_instructors_and_archiving.test.sql`). Migration 0013 was deliberately excluded and
  not applied. No persistent, protected or hosted database was accessed or changed. No Git
  staging, commit, or push occurred. Migration 0012 remains unapplied to any database
  (not local, staging, or production). See D37 for the equivalent prior 0013 pattern.
- **Migration 0013** (`supabase/migrations/20261031120000_0013_public_instructors_and_archiving.sql`,
  Q-07-6 public instructor names and Q-07-10 who archives a course) is promoted into the
  working tree and tested in the throwaway PostgreSQL 16 sandbox: 17 test files, 789 tests,
  all pass (764 canonical + 25 in the new `055_public_instructors_and_archiving.test.sql`;
  `050_courses.test.sql` changes one expectation). Frontend: lint 0, build 0, live-mode
  browser tests 17/17. **Not applied to any database** — not local, not staging, not
  production — and not committed. D37 is recorded in `docs/decisions.md`; the review drafts
  stay in `docs/review-artifacts/Q07-6_Q07-10/`.
- **Ordering:** migration 0012 now has timestamp `20261030120000`, which sorts and is
  applied before 0013 (`20261031120000`), as already required for the reservation.
  Migration 0012 remains unapplied to any database; it was not used to change migration 0013
  or its placement.

## Working defaults built in (for confirmation)

Q-06-1/2, Q-07-1…15, Q-08-1…5, Q-09-1 as recorded in the review package; plus:
- **Q-P4-1** Corrections: proposed by course staff or org admins; approved by another org admin
  (platform courses: another Platform Admin); Platform Admins never touch org-course content.
- **Q-P4-2/3/4** Correctable: titles, summary, lesson text, quiz prompts, options, explanations;
  never keys, settings or structure. Stale text must be re-proposed. Clone copies outline,
  text and quizzes, not files.
- **Q-07-5 / Q-10-1 / Q-10-2** Video: stored MP4/WebM (500 MB bucket limit; Free plan caps at
  50 MB) or unlisted YouTube on public courses with a non-sensitive attestation. Org-only
  course thumbnails are private. 15-minute signed URLs from `media-url`.
- Lesson text is plain text (paragraphs, auto-linked URLs); no HTML is rendered.

## Not from Figma (built in the existing design language, flagged)

Workspace switcher; suspended-organization notice; staff, corrections, publication and
assignment panels on the course page; support lookup page. Fields the data model does not
hold (category, level, duration, outcomes, "last active", activity feed, org branding) are
omitted rather than invented. Certificates and messaging stay "coming later" (P21).

## Blocking questions (sent 27 October 2026; awaiting answers)

1. Create Supabase project `aqs-staging` (free, eu-central-1).
2. [Resolved — owner approval, Option B, 29 October 2026] Do not commit `20261022210000_0005_preview_email_gate.sql`; remove it from `supabase/migrations/` (preserved as review evidence in `docs/review-artifacts/preview_email_gate.DRAFT.sql`) so the canonical sequence is 0001–0004, 0005a–0011 (13 migrations). Apply those ONLY to staging.
3. Google OAuth client for staging (owner enters the secret).
4. Email provider: Resend free tier (until then, copyable links).
5. Push `feature/first-release` and deploy the Render static site.
6. Accept the working defaults above.
7. Video size vs. plan cost (stay on Free for staging).
8. Record edits: T1 amendment, D34 count (21), F7 superseded, `config.toml` fix.
9. [Resolved - promoted 31 October 2026] Migration 0012 revoking `service_role` access on
   older tables: canonical migration and test promoted and validated in a disposable
   PostgreSQL 16.15 environment; still unapplied to local, staging, or production.
10. Pause the existing project with RLS disabled.
11. Before production: legal texts, company details, P23 wording.

## Known limits

- Corrected 27 October 2026: CI's database job does **not** need 0005 (the full suite passes
  764/764 on a clean checkout without it); 0005 matters only for the local migration history.
- 27 October 2026: both Edge Functions type-check with Deno 2 (`deno check`); helpers are
  unit-tested. They now prefer the current publishable/secret keys and verify the caller's
  session in code (`verify_jwt = false`).
- PKCE verifier investigation 31 October 2026: AQS uses Supabase Auth standard PKCE (`flowType: 'pkce'` in
  `src/lib/supabase.ts`, using `@supabase/supabase-js` / `@supabase/auth-js` 2.117.3). A successful Google OAuth
  login left residual local-storage keys `sb-txp...-auth-token-flow-*-code-verifier` and
  `sb-txp...-auth-token-flows-code-verifier`; the legacy key was absent. Dependency source confirms `_exchangeCodeForSession`
  invokes `removePKCEVerifier` in success and catch paths. No AQS code owns or manages this verifier storage, and no
  app implementation defect or exploitable vulnerability has been demonstrated. Status:
  provisionally accepted. Revisit only if authentication failures or repeated anomaly occur during a separately
  authorized investigation.

- Auth recovery limitation (Gate B): AQS `profiles.id` references `auth.users.id`, and public profile, membership,
  invitation, course, enrolment and report records depend on matching UUIDs. The ordinary `supabase db dump`
  command excludes managed schemas, including `auth` and `storage`; therefore it cannot by itself preserve
  Auth identity. The Supabase `Platform to self-hosted` procedure separately documents CLI dump steps and states
  that the resulting restore includes `auth.users` and related data. Gate B remains blocked until this is
  independently verified in a disposable self-hosted environment. An Auth recovery test must distinguish an
  ordinary export from the officially documented platform-to-self-hosted route and must verify restored
  `auth.users.id` = `public.profiles.id` for representative accounts, plus all corresponding memberships,
  invitation audit references, course ownership, and learner progress references. `auth.identities` Google provider
  fields must also be checked. `auth.users`, `public.profiles`, and downstream FKs must be preserved. Ephemeral
  fields such as sessions, OTP tokens, MFA challenge state and refresh tokens must not be relied on. Auth,
  Storage and Edge Function recovery remain separate. Supabase's supported recovery options and plan limitations
  remain unverified.
- Gate B recovery note (revision 4): Supabase's official Platform-to-self-hosted procedure uses CLI
  roles/schema/data dumps and states that these include `auth.users` and related data. Supabase guidance
  also describes Auth schema tables, hashed credentials and manual provider/key handling. This means Auth
  UUIDs and Google association relationships can potentially be tested in a disposable self-hosted
  environment, but only after owner-approved verification. Old access/refresh tokens cannot be assumed to
  remain valid against a target with a different JWT secret, and Storage objects and Edge Functions still
  require separate recovery. Gate B remains blocked until that test succeeds and is documented.
- Gate B recovery-design note: ordinary `supabase db dump` output includes schema and data but excludes
  managed schemas, including `auth` and `storage`. Auth data preservation must be tested separately under
  an officially supported Supabase platform restore path, with all UUIDs and relationship preservation
  independently verified. Storage, Auth credentials, secrets, Edge Function deployment, and migration history
  must be treated as distinct recovery components. No such test has been executed.
