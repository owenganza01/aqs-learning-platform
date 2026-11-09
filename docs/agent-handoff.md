# Agent handoff

Single source for "where are we and what is next". Update at every task boundary. Decisions live in `docs/decisions.md`; milestone history in `docs/progress-report.md`.

## Current position: completion programme, CM1 Prompt 1 done locally (3 November 2026)
The owner approved the completion programme CM1–CM5 (ten prompts; rules in `CLAUDE.md`).
CM1 is complete (CM1 Prompt 2, 3 November 2026) and published on GitHub `integration`
(`9176499`, handoff corrections `b3d9bec`, pushed by the owner). Nothing was merged, deployed or
applied; staging is unchanged (frontend `4375371`,
migrations 0001–0013 and 0015, functions `invitations` v4 and `media-url` v4).

- **N1/N2 upload integrity:** migration **0018** (`20261103160000_0018_upload_integrity.sql`,
  **not applied**). Uploads now go begin (pending path) → file upload → finish (object must
  exist); a failed upload is cancelled and leaves the lesson or course unchanged. Publication is
  refused when a lesson video, resource file or thumbnail object is missing. The frontend uses
  the new functions when present and falls back to the old ones (with undo on failure) when 0018
  is not applied; the deployed `4375371` frontend keeps working with 0018. 0018 also makes the
  0017 cleanup skip pending uploads (so F before G). Open pre-apply check: that `postgres`
  bypasses row rules on hosted `storage.objects` (package G).
- **Cache lifetime:** new uploads set `cacheControl` 900 seconds (`UPLOAD_CACHE_SECONDS`).
- **CI preparation:** `npm run check:build` (production-build boundary: no dev pages, sample
  data or secret patterns) and `npm run check:functions` (Deno 2.5.6 type-check of all three
  Edge Functions, including the `storage-cleanup` entry file). The CI file itself is protected;
  the change is package H for the owner.
- **Rollback scripts** for 0014, 0016, 0017, 0018 in `supabase/rollbacks/`, sandbox-verified by
  `scripts/db-sandbox/rollback-check.sh` (4/4 identical catalog and schema dump).
- **Packages prepared** (nothing performed): `docs/cm1-authorisation-packages.md` (A push +
  staging deploy, B review branch, C merge to master, D 0014, E 0016, F 0017, G 0018, H CI),
  `docs/second-platform-admin.md`, `docs/video-provider-brief.md` (for CM2 Prompt 1).
- **CM1 test results (local and sandbox):** database 990/990 (sandbox); unit 9/9; functions
  10/10; Deno check pass; lint, build, build check pass; e2e preview and live: see the CM1
  Prompt 1 report in the Claude Project.
- **Work allocation (owner, 3 Nov):** CM2, CM3 and CM5 preparation by a human developer through
  his fork and pull requests into `integration`; CM4 and CM5 integration and acceptance by
  Claude. Handoff package: `docs/developer-handoff.md`, progress files `docs/progress/`, pull
  request template `docs/pull-request-template.md`. The fork can sync only after package B
  (or A) is authorised and pushed.
- **CM2 (3 November 2026):** decisions recorded in D39 (YouTube channel after two-gate AQS
  review for public courses; organisation-only video in Storage with confirmed captions;
  retention periods deferred). Specification `docs/cm2-implementation-package.md`; packages
  released to the human developer (`docs/progress/cm2.md`).
- **Next:** CM2 implementation by the developer; owner authorisations F → check → G and H;
  then CM2 Prompt 2. 0014 only after package A is done and the new frontend is verified live.

## Earlier position: M5 final (3 November 2026, ~02:30 SAST) — release candidate, M5 complete
- **All five milestones complete.** M1 Identity, M2 Courses, M3 Learners, M4 Administration and reporting: complete and approved (reports in the Claude Project: `claude/m1-milestone-report-2026-11-02.md`, `claude/m2-implementation-report-2026-11-03.md`, `claude/m3-implementation-report-2026-11-03.md`, `claude/m4-implementation-report-2026-11-03.md`). **M5 complete for implementation and release-readiness assessment** (owner, 3 Nov; `claude/m5-release-readiness-report-2026-11-03.md`, approved subject to its limitations and production blockers). **No further milestone or implementation phase is planned.**
- **Status:** staging release candidate with synthetic data. **Not production-ready and not approved for real personal data** until RB1–RB8 below are resolved.
- Final M5 items (owner instruction, 3 Nov): landing heading changed to "From sign-in to completion." (layout unchanged); axe-core accessibility checks added to the e2e suites so CI runs them (`docs/accessibility-testing.md`, manual checks kept); orphaned-file cleanup **prepared only** (migration 0017 + Edge Function `storage-cleanup`, not applied, deployed or scheduled); DF3 kept open.
- Evidence labels used everywhere: **staging** = observed on `aqs-staging` with real Google sessions; **sandbox** = throwaway PostgreSQL 16 + pgTAP (simulated Supabase, not hosted); **local** = local build, Playwright with design-preview data or a mocked Supabase API. Local and sandbox results are not evidence about the hosted database.

### Branch and commits
- Branch `feature/first-release`. Last pushed (and deployed to staging): `4375371`. All later commits are **local only** — 42 commits ahead of `4375371` after the final M5 commits (this handoff is the last). Nothing pushed, merged or deployed by the agent. Untracked by owner decision: `.claude/`, `docs/archive/`.
- Staging runs: frontend `4375371`; Edge Functions `invitations` v4 and `media-url` v4 from `ade1050`; migrations 0001–0013 and 0015. **Not on staging:** 0014, 0016, 0017, `storage-cleanup`, and every local commit after `4375371` (DF7, DF9–DF13, I1–I3, I7, D38 #10/#13 UI, P23, the heading change).

### Final test results (3 Nov, after the final M5 items)
| Suite | Result | Kind |
|---|---|---|
| Database (pgTAP, incl. 085 cleanup 37 tests and the updated 900 allow-list) | 948/948 | sandbox |
| Edge Function helpers (`npm run test:functions`) | 10/10 | local |
| Unit (`npm run test:unit`, incl. 5 cleanup safety tests) | 9/9 | local |
| e2e preview (`npm run test:e2e`, incl. 66 axe checks) | 377/377 | local |
| e2e live, mocked API (`npm run test:e2e:live`, incl. 50 axe checks) | 83/83 | local |
| Lint, build | pass | local |
No staging writes, migrations or deploys were made for the final M5 items; two read-only catalog queries on staging (role and privilege attributes of `postgres`/`service_role` on `storage.objects` and the course tables) informed the 0017 privilege design. M5 assessment evidence (kept): staging signed-out re-check clean (GraphQL 406, tables 401, privileged functions 404/401, Edge Functions 401); Supabase advisor baseline unchanged; secrets scan of the unpushed commits clean (repeated for the final commits).
Earlier milestone runs (kept for the record): M5 assessment — database 911/911, functions 10/10, unit 4/4, live 33/33, preview 311/311; M4 — database 911/911, live 33/33, preview 310/310; M1 — pgTAP 897/897.

### Outstanding owner-authorized actions (none done by the agent)
1. **Push** `feature/first-release` (Render auto-deploys the frontend to staging), then re-run the M5 smoke checks on staging for the local-only fixes.
2. **Apply migration 0014** (DF3) to staging, then verify: a signed-in user of another organization can no longer read `created_by`/`published_by`; course pages still show instructor names (`course_people`).
3. **Apply migration 0016** (D38 #10) to staging, then verify the suspended-organization course titles on a learner dashboard.
4. **CI:** add `- run: npm run test:unit` to the protected `.github/workflows/ci.yml` (web job, after `test:functions`). The agent cannot write that file. The new accessibility checks already run in CI through the existing e2e steps.
5. **Second Platform Admin** on staging and in production (OD5/RB6; F6 owner-run SQL), then verify platform-course publishing and corrections.
6. **Design reference access** (`design-reference` folder or Figma link) if a frame-by-frame design comparison is wanted.
7. **Orphaned-file cleanup** (RB5), in this order, each step only when authorized: apply 0017; deploy `storage-cleanup`; set `CLEANUP_SECRET` (32+ random characters) as a function secret; run a **dry run** and review the list and `private.storage_cleanup_audit`; schedule it (for example daily with pg_cron + pg_net, sending the secret in `x-cleanup-secret`; the secret must be kept in Vault, not in SQL text); only then set `CLEANUP_DELETE_ENABLED=true` and send `{"mode":"delete"}`. Optional `CLEANUP_MAX_PER_RUN` (default 100, max 500).
8. Invitations created for the M1 tests expire 9 November 2026; nothing to do unless they are needed.

### Production blockers (from the M5 report; all owner, legal or deployment items)
| # | Blocker | Owner action |
|---|---|---|
| RB1 | Legal and privacy gate R1–R5: legal advice, wording of the privacy notice and terms, age confirmation, anonymization procedure, Data Security Document | Owner + legal |
| RB2 | Production environment: AQS-owned accounts (B1), paid tier with backups (B2), production Supabase and Render projects, Auth URLs, secrets, Edge Function deploy | Owner |
| RB3 | Apply 0014 (closes **DF3**) and 0016 to the production database (and staging first) | Owner authorization |
| RB4 | Push the branch; deploy the reviewed frontend and functions | Owner authorization |
| RB5 | Orphaned-file cleanup running (D38 #9) — **prepared** (0017 + `storage-cleanup`), needs apply, deploy, dry run, schedule, then deletion enabled | Owner authorization |
| RB6 | Second Platform Admin in production (P1 needs two for platform courses) | Owner (F6 SQL) |
| RB7 | Invitation email provider, or a confirmed copy-link process (OD4) | Owner decision |
| RB8 | Production storage limits: plan upgrade or lower limits (Free plan caps uploads at 50 MB, Q-10-1) | Owner decision |

### Path from staging release candidate to a legally approved production release
1. **Staging catch-up:** push; apply 0014 and 0016 to staging; verify DF3 closed and the D38 #10 display; add the CI `test:unit` line; confirm CI is green (including the accessibility checks).
2. **Cleanup on staging:** apply 0017, deploy `storage-cleanup`, set its secret, dry run, review, schedule, enable deletion, confirm the audit rows.
3. **Manual accessibility pass** (`docs/accessibility-testing.md`): screen reader, keyboard, 768 px, zoom. Fix anything found.
4. **Legal and privacy gate (RB1):** legal review of data processing, privacy notice and terms, age confirmation, anonymization (F8/R4) and the Data Security Document; record the approval in `docs/decisions.md`.
5. **Owner decisions:** RB7 (email provider or copy-link), RB8 (storage plan/limits), second Platform Admin (RB6).
6. **Production environment (RB2):** AQS-owned Supabase and Render accounts on a paid tier with backups; new project; apply migrations 0001–0017 in order; Google sign-in and Auth URLs; secrets; deploy `invitations`, `media-url`, `storage-cleanup`; deploy the frontend; create two Platform Admins with the F6 procedure.
7. **Production verification with synthetic accounts:** repeat the M1–M5 staging checks (isolation, signed-out access, storage, Edge Functions 401 without a session, advisor baseline, cleanup dry run), then remove or suspend the synthetic data.
8. **Go-live approval:** the owner records the legal approval and the release decision; only then are real organizations and personal data admitted.

### Known limitations carried (from the M5 report, updated)
1–3, 4–7, 9, 12, 13 of the M5 report stand. Changed: #6 cleanup now **prepared, not active**; #8 CI `test:unit` still an owner action; #10 accessibility checks **now automated in CI** (manual pass still outstanding); #11 heading **resolved** ("From sign-in to completion."). Also: `npm audit` reports moderate advisories in development-only lint tooling (eslint/minimatch), present before this work; the axe dependency adds none. The `storage-cleanup` entry file is now Deno type-checked (`npm run check:functions`, CM1).

## Staging state (synthetic data, OD15 log)
| When (SAST) | Operation | By | Reversible by |
|---|---|---|---|
| 2 Nov, 08:51 | Created draft orgs "ZZ Test Org A" `9c1c4af5-627b-418e-9b19-db4adeab7193`, "ZZ Test Org B" `23241870-62a7-4beb-a518-44e5a203e6e3` | Platform Admin (owner session) | Suspend (no hard delete, F8) |
| 2 Nov, 08:51 | 6 invitations (U1 org_admin A; U2 learner A, instructor B; U3 org_admin B, learner B, instructor A) | Platform Admin | Revoke |
| 2 Nov, 08:51 | Revoked U3 instructor A invitation | Platform Admin | — |
| 2 Nov, evening | Stage 1 step 1: U1 accepted org_admin A (U1 user and profile created by sign-in) | U1 | Remove membership |
| 2 Nov, ~22:00 | Stage 1 step 2: U3 accepted org_admin B (U3 user and profile created by sign-in) | U3 | Remove membership |
| 2 Nov, ~22:05 | Stage 1 step 3: Org A and Org B activated | Platform Admin | Suspend |
| 2 Nov, ~22:08 | Stage 1 step 4: U3 accepted learner B (same membership, roles org_admin+learner) | U3 | Revoke role |
| 2 Nov, ~22:10 | U2 signed in once (user and profile created); no invitation accepted (DF8) | U2 | — |
| 2 Nov, ~22:15 | Stage 2: two invitations to Org A for `zz-m1-u1-learner@example.com` (learner) and `zz-m1-u1-instructor@example.com` (instructor), both revoked straight away; no email sent (no provider configured) | U1 | — |
| 2 Nov, ~22:20 | Stage 2: Org B suspended, then reactivated | Platform Admin | — |
| 2 Nov, ~22:22 | Stage 2: one P15 support lookup, case ref `M1-TEST-001` (audited) | Platform Admin | — |
| 2 Nov, ~23:35 | **Migration 0015 applied** (owner approval 23:32): one transaction, refused if already recorded; history row `20261102130000 0015_workspace_hd_claim_location` (3 statements). Function md5 before `1804e97b…`, after `8effa529…`; still not executable by anon/authenticated/service_role; search_path fixed. 0014 NOT applied. | Agent (Supabase connection) | Re-run 0006 function definition |
| 2 Nov, ~23:40 | Stage 1 step 5: U2 accepted learner A and instructor B | U2 | Remove membership |
| 2 Nov, ~23:45 | Stage 2: U1 granted then revoked instructor for U2 in A; suspended then reactivated U2 in A; removed U2 from A; re-invited U2 (learner A, link only, no email); U2 accepted (rejoined with learner only, C2) | U1, U2 | — |
| 2 Nov, ~23:45 | Stage 2: U3 granted learner to U2 in B, revoked instructor, restored instructor, revoked learner (net: unchanged) | U3 | — |
| 2 Nov, ~23:50 | Final read-back; one P15 lookup per org, case ref `M1-TEST-002` (audited) | Platform Admin | — |
| 2–3 Nov, ~23:55–00:10 | M2 course workflows in Org B (all synthetic, "ZZ M2 …"): courses C1 public/open (published → corrected → reverted → archived), C2 org-only (declined), C3 by U3 (approved by Platform Admin), clones "v2" (of published C1) and "Clone of Archived"; small PNG thumbnail, 1 text resource, 1 tiny MP4 uploaded to C1 paths issued by the database; one platform course draft "ZZ M2 Platform Course" (requested then withdrawn) | U2, U3, PA | Archive (published); drafts stay drafts |
Now: both orgs active, no pending invitations. Org A: U1 org_admin, U2 learner. Org B: U3 org_admin+learner, U2 instructor. Org B courses: C1 archived, C3 published (org-only), C2 + 2 clones drafts. Platform: 1 draft.

## M4 staging results (3 Nov ~00:55–01:10 SAST; no staging writes in M4)
- Org Admin (U3, Org B): dashboard counts own org only (2 members, 1 learner); members page names+emails of own members (P7); settings read-only; Learners page shows only own-org learners (G1, public learner U1 excluded), no emails.
- Course staff (U2): Learners/results include the public learner, names only, no emails (G2); organization_members → 403; only own profile email readable; answers visible only as the reveal policy allows (Q-09-1).
- G3: Org Admin sees only own attempt/answers.
- Platform Admin: overview, Organizations, Reports (P19 A1–A7, counts match staging exactly), Users and roles = lookup only (L11); org admin/teach URLs → no access.
- Audit (T9): one read-only, counts-only SQL query on `private.organization_audit` / `private.platform_admin_audit` for the ZZ orgs; counts match every M1–M3 operation.

## M3 staging results (3 Nov ~00:25–00:45 SAST, real sessions, application functions only)
Staging log (synthetic, OD15): U2 built and proposed "ZZ M3 Learner Course" C4 (public/open; reading with 1 downloadable + 1 view-only text file, tiny MP4 video, 2-question quiz 70%/3 attempts/no retake after pass/reveal after final attempt); U3 approved it, assigned C3 (org-only) to self with a due date and C4 to self; U3 completed C3; U1 self-enrolled in C4, took 3 quiz attempts, completed it; U3 passed the C4 quiz; U3 archived C4; Platform Admin suspended then reactivated Org B.
- Catalogue: published public C4 visible to an outsider; org-only C3 not.
- Self-enrolment: open public course 200 (idempotent); org-only course 403. Before enrolment: no lesson text, no file URL (403), no completion (403).
- Assignment (Q-08-4): org admin assigns to a learner of the org with a due date; duplicate, non-learner member (instructor) and outsider refused.
- Completion (P8): lessons complete idempotently; a quiz lesson completes only by passing; all lessons done → enrolment completed with timestamp.
- Quizzes: server grading (0%, 50% partial, 100%); same idempotency key → replay, no new attempt; unknown option → 400; answers hidden until final attempt (G6/G7), then 5 rows with keys and explanations; 4th attempt refused; retake after pass refused (G5); answer keys never readable.
- Media (P16/L7a): enrolled learner gets 15-minute signed URLs (file content fetched; download flag set) for a downloadable file and the video; a non-downloadable file is refused to learners by design (L7a, page lists downloadable files only); outsider before enrolment and Platform Admin 403.
- Archived (L13): enrolled learner keeps outline, text, file and answer review; completion and attempts refused; hidden from the public.
- Suspended (P11): learner loses course record, outline, text and files; keeps own enrolment and progress rows; quiz summary refused (own attempt rows stay readable, pgTAP 070); reactivation restores. D38 #10 titles need 0016 (staging returns PGRST202; the app falls back).
- G1/L11 P3: Org B admin sees only Org B members among C4 learners; Platform Admin sees no learner records, quiz results or files of org courses.

## M2 staging results (3 Nov, real sessions, application functions only)
- Authoring (U2 instructor B): create, details, modules/lessons add/rename/reorder/delete, lesson text, quiz settings/questions/options/explanation — all 200/204. Create in Org A or as platform course → 403.
- Files: thumbnail PNG ok, PDF type refused; resource upload ok, >100 MB refused (raw constraint text, DF10, now caught in the app); video ok, >500 MB and .exe refused; uploads to paths the database did not issue → Storage 403 (RLS).
- Publication (L2/P22/Q-07-3): request locks edits (400); withdraw unlocks; proposer cannot approve course or preview (403); U3 approved preview + publication; decline needs a reason; Org Admin cannot approve own course (P22); Platform Admin approved U3's org course seeing record + outline only, no lesson text (Q-07-2), and lost sight of it once published (L11 P3).
- Frozen published course (P5): text, quiz, structure, video changes → 400 P5 message.
- Corrections (P4/G4): attestation required; one pending per text; withdraw; proposer cannot decide (403/G4); approve applies text with old/new kept; revert by staff, approved by U3, text restored; second revert refused; approver-proposed revert cannot be self-approved (G4).
- Clone (Q-P4-4): published/archived only; copies outline, text, quiz (settings, question, options), not files/previews; draft visibility/policy kept.
- Archive (Q-07-10): Org Admin only (instructor 403); reason required; published only; archived course: no edits, corrections or staff changes; hidden from anonymous visitors; clonable.
- Staff (P3): Org Admin adds/removes staff (instructors or org admins); non-eligible person refused. Observation: a course can be left with no staff (allowed by P3).
- Public (P6/Q-07-6/L3): anonymous sees published public course, outline, instructor name (instructor only), preview lesson text, public thumbnail; not drafts, other lesson text, resources, staff IDs (anon), quiz keys, private files or videos.
- Cross-org (U1, Org A admin): sees only the published public course and its preview; every read of drafts/content/resources/staff/keys/corrections → 0 rows, every action → 403.
- Platform Admin (L11 P3): no Org B drafts, content, resources, keys, files; clone/correct/create in org → 403. Platform course: create/build/request ok; self-approval refused (P1/P22) → publishing platform courses needs a second Platform Admin (OD5).
- DF3 confirmed on staging: a signed-in user of another org reads `created_by`/`published_by` of a public course (fixed by 0014, not applied). Invitations expire 9 November 2026. Links exist only in the owner's built-in-browser tab (sessionStorage). All test sessions were ended with a local (single-session) logout.

Deployed Edge Functions (2 Nov, ~19:25 SAST, OD2): `invitations` v4 `e406fe97…` and `media-url` v4 `a8c22992…`, both from `ade1050`, `verify_jwt` false. Rollback = redeploy the `4375371` files. Deno type-check not run.

## Open defects
- DF1 fixed on staging 2 Nov (OD2): bad tokens now 401. O-A6-2 (media-url body checked before session, 400) remains; harmless.
- DF2 closed by DF8: the real Workspace claim location is now known.
- **DF3 — OUTSTANDING PRIVACY DEFECT.** Q-07-12: staff account IDs (`created_by`, `published_by`) of public courses are readable by signed-in users of other organizations (confirmed on staging, M2). Migration 0014 prepared and sandbox-tested (`5bbfced`); app reads through `course_people` with a pre-0014 fallback (`debc166`). **Stays open until 0014 is applied and verified** on staging and production (RB3). Not approved for real personal data while open.
- DF4 platform courses default to "assigned" — guard done (`d6a2502`, Q-08-7).
- DF5 no cleanup of orphaned private files — before real data (D38 #9). **Prepared (3 Nov), not active:** migration 0017 and Edge Function `storage-cleanup` (dry run by default, 24-hour minimum grace, per-run cap, re-check before each delete, append-only audit). Open until applied, deployed, scheduled and verified (RB5).
- DF7 fixed in code (`cd65913`): invitation sign-in asks Google for its account chooser. Reaches staging only after the owner pushes (Render auto-deploy). Staging tests used a page-side workaround (adds `prompt=select_account` before the redirect).
- **DF8 (found 2 Nov, Stage 1 step 5)**: a real Google Workspace sign-in (U2, alustudent.com) stores `hd` under `identity_data.custom_claims.hd`, not at the top level. 0006 read only the top level, so every Workspace invitee is refused (preview empty, accept 42501), contrary to D33. U2: `email_verified` = boolean true; top-level `hd` absent; `custom_claims.hd` = `alustudent.com`. Fix: migration 0015 (`8efbf55`) reads either location, refuses non-string values and refuses two values that disagree (this also closes a gap where a top-level hd could mask a different nested one). pgTAP 036: 6/16 fail without 0015, 16/16 with; full suite 897/897. **Fixed on staging 2 Nov ~23:35** (0015 applied); U2 passes the gate and accepted both invitations.
- I3 (M4): Learners page marks and counts overdue assignments (members only; public learners have no due dates). e2e test.
- DF12 (M5): WCAG contrast — muted text on tinted fills (course outline, course builder, quiz builder, quiz summary) and the access note in the navy course hero (1.51:1). Fixed with existing tokens.
- DF13 (M5): tables that scroll sideways on phones could not be reached by keyboard. Table scroll box becomes a focusable, labelled region only when it scrolls.
- Landing heading (M5): changed to "From sign-in to completion." on owner instruction (3 Nov); layout unchanged.
- DF10 (M2): an empty or >100 MB material file reached the database and came back as a generic error. Fixed in the data layer with a clear message before anything is stored; regression test.
- DF11 (M2, design check): at 1440 px the course outline column (I1: 260–320 px) squeezed module titles to one word per line beside four controls. Fixed: module controls on their own line; column width unchanged.
- **N1/N2 (CM1, audit)**: a failed upload could leave a lesson or course pointing at a file that never arrived, and publication did not check that stored files exist. Fixed in code and migration 0018 (not applied); see the CM1 section above.
- DF9 (found 2 Nov): opening a second invitation link in a tab already showing `/invite` changed only the fragment, so the page kept the old invitation's state. Fixed in code (listens for `hashchange`; a new token restarts the flow), with a regression test that fails on the old page. Reaches staging after a push.

## Gated actions (need explicit owner approval)
- CM1 packages A–H: `docs/cm1-authorisation-packages.md`. Older list: "Outstanding owner-authorized actions" above. Any migration, push, deploy, hosted configuration or secret change needs explicit owner authorization.

## Next action
Owner decisions on the CM1 packages, then CM1 Prompt 2 (completion report and verification).

## M1 tasks
1. [done] Record D38 (`aacab88`).
2. [done] CLAUDE.md and this handoff.
3. [done] Reconcile stale documentation (`0dd215e`). The recovery runbook named in the 1 November handover is not in this repository; its correction stays open until located.
4. [done] OD2 deployed and verified (Claude Project: `claude/od2-deployment-result-2026-11-02.md`).
5. [done] T4 on staging: GraphQL refused for signed-out and signed-in callers (406 PGRST106).
6. [done] A8 Stage 1 — steps 1–6.
   - 5 After 0015: U2 email_verified boolean true, top-level hd absent, custom_claims.hd = alustudent.com, Google the only identity → preview "Join ZZ Test Org A — Learner"; accepted. Instructor B accepted. Two separate memberships.
   - 6 PA final read-back: A 1 admin + 1 learner; B 1 admin + 1 learner + 1 instructor; 0 pending; both active.
   - 2b U3 preview "Join ZZ Test Org B — Organization Admin"; U3 `email_verified` boolean true, gmail.com. 2c revoked link: page shows nothing; direct accept 400 "this invitation is revoked". 2d U3 active org_admin B, Org B draft.
   - 3 PA activated A and B through the app. 4 U3 accepted learner B → one membership, roles org_admin+learner.
7. [done] A8 Stage 2 on staging:
   - U2 as learner (A) and instructor (B): cannot invite (403 ×3), cannot change own roles or membership, cannot list members (organization_members 403), cannot call platform functions, sees only own membership rows and own profile.
   - U1 on U2 in A: list members (self + U2 only); grant/revoke instructor 204; grant org_admin 403 (Platform Admin only); suspend → U2 loses Org A (row shows suspended), reactivate → restored; remove → U2 loses Org A, keeps B; removed member cannot invite; re-invite + accept → active with learner only (C2). U1 on U2 in B: 403.
   - U3 on U2 in B: grant learner / revoke instructor / restore 204; on A: 403; cannot revoke U1's invitation (403); cannot list A members.
   - No-membership user (U2): sees only own profile; invite to A or B → 403.
   - U1 (org_admin A): sees only Org A; invite learner/instructor A → 200; org_admin A → 403 "only a Platform Admin can invite an org admin"; learner B → 403; own email → 403 "you cannot invite your own email address"; revoke a B invitation → 403; suspend A → 403; grant role in B (self → "cannot change your own roles"; other → "not permitted"); member status in B → 403; direct insert into invitations → 403; PATCH Org B → 403; revoke own A invitations → 204, again → 400.
   - U3 (org_admin+learner B): sees only Org B; invite to A, revoke A invitation, suspend A, suspend own B → all 403.
   - Org suspension (P11): while B suspended, U3 sees no org, no invitations, invite → 403, cannot reactivate (403); PA reactivates → U3 sees B again.
   - P15: PA routine view of Org A omits U1's own invitations; lookup without case ref → 400; with case ref → finds it.
8. [done] M1 milestone report (Claude Project: `claude/m1-milestone-report-2026-11-02.md`).
Limitations: DF7 and DF9 code fixes are not on staging until pushed (tests used a page-side account-chooser workaround and reloads); 0014 not on staging; two test sessions (U2, U3) were cleared from the browser without a server logout — their refresh tokens were held only in that tab and are gone; Deno type-check of Edge Functions not run; history row for 0015 stores the statements with trailing whitespace trimmed (content identical).
