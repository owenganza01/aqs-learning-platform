# Developer handoff: CM2, CM3 and CM5

**Prepared 3 November 2026 by Claude for the owner (Ornella Imena, AQS) and the human developer.**
This is one AQS project, not a separate implementation. You follow exactly the same project
instructions, product decisions, technical standards, security restrictions, priorities and
acceptance criteria as Claude. Where this file and `docs/decisions.md` disagree,
`docs/decisions.md` wins and you raise the conflict in your pull request.

Read in this order before you write code:

1. `CLAUDE.md` — the rules. Every hard rule there applies to you as it applies to Claude. Part 0 below comes first for CM2.
2. This file.
3. `docs/agent-handoff.md` — current state of the code, staging and open defects.
4. The parts of `docs/decisions.md` your package touches (each package below names them).
5. `docs/cm1-authorisation-packages.md` — what is waiting for owner authorisation.
6. `docs/cm2-implementation-package.md` and D39 (CM2), `docs/accessibility-testing.md` (CM3), `docs/staging-runbook.md` (CM5).

The owner can also share the Claude Project audit document "AQS Comprehensive Audit and
Production Readiness Report" (section 26 is the roadmap reproduced in part 1 below).

---

## 0. Start here: CM2 release (3 November 2026)

**Authoritative source:** `https://github.com/owenganza01/aqs-learning-platform.git`, branch
`integration`. The CM2 release commit is the one the owner announces with this release. Your
starting point is that commit or a later one on `upstream/integration`, never an older fork
branch. Your fork, made on 30 October, predates `integration` entirely.

**The seven CM2 documents** must all be present in your clone at that commit:
1. `docs/cm2-implementation-package.md`
2. `docs/decisions.md` (D39)
3. `docs/developer-handoff.md`
4. `docs/progress/cm2.md`
5. `docs/video-provider-brief.md` (marked superseded by D39)
6. `docs/agent-handoff.md`
7. `docs/cm1-authorisation-packages.md`

D39 supersedes every Mux, Cloudflare or paid-provider recommendation. CM2 uses the AQS-owned
YouTube channel for public courses, and private Storage with confirmed captions for
organisation-only courses.

**Answers to the setup questions**

| Question | Answer |
| --- | --- |
| Which branch? | One branch per package from a freshly fetched `upstream/integration`, for example `cm2/CM2-1-video-review`. The root `AGENTS.md` in this repository states the same rule, and it supersedes any generic branch instruction from another `AGENTS.md` or tool default. If a local, untracked `AGENTS.md` blocks `git merge` or `git switch`, rename it (for example `AGENTS.local.md`) rather than overwrite the repository's file |
| How do I run the database tests on Windows? | `scripts/db-sandbox/run.sh` needs Linux (or WSL2 Ubuntu), PostgreSQL 16, pgTAP and a non-root user. **For CM2-1, use CI as evidence:** enable GitHub Actions on your fork (Actions tab, "I understand my workflows…", one-time) and push your branch. The `database` job runs the full sandbox on Ubuntu 24.04 with PostgreSQL 16. Link that run in your pull request. Do **not** change `scripts/db-sandbox/*` inside CM2-1. Any runner improvement (for example a Windows or WSL helper) goes in its own pull request, reviewed separately |
| Where is the specification? | `docs/cm2-implementation-package.md` (parts 1–9a) and `docs/decisions.md` D39. If a part is unclear or conflicts with D39, open a pull-request comment or an issue labelled `decision-needed`; do not guess |
| What order, and when is CM2 done? | CM2-1 → CM2-2 → (CM2-3, CM2-4); CM2-5 any time. CM2 is done when every package has a pull request into `integration` and its acceptance criteria (package part 6) are evidenced in your milestone report (part 6 below). Staging-only evidence is marked "pending owner action" |

**Check your starting point yourself, then start.** No acknowledgement or confirmation is
needed: you work through CM2, CM3 and CM5 on your own. Record these facts at the top of your
CM2 completion report:

```text
Upstream integration commit: <output of: git rev-parse upstream/integration>   (must be 5ceb443 or later)
Documents present: <output of: git ls-tree --name-only upstream/integration -- AGENTS.md docs/cm2-implementation-package.md docs/decisions.md docs/developer-handoff.md docs/progress/cm2.md docs/video-provider-brief.md docs/agent-handoff.md docs/cm1-authorisation-packages.md>   (all 8 must be listed)
Baseline on the unchanged commit: lint, build, test:unit (9), test:functions (10), test:e2e (377), test:e2e:live (89); database job link from CI on your fork (990)
```

If your baseline differs from those counts, find out why before changing code, and say so in
the report.

---

## 1. The approved programme

The owner approved five completion milestones on 3 November 2026. There are no others.
M1–M5 are closed and deferred features stay deferred.

| Milestone | Implementation owner | Claude's role |
| --- | --- | --- |
| CM1 Integration and Critical Fixes | Claude | Implementation (done locally, 3 Nov) |
| CM2 Storage and Video | **Human developer** | Architecture consistency, review, integration, authorised restricted actions, Prompt 2 verification |
| CM3 Product and Learner Experience | **Human developer** | Same as CM2 |
| CM4 Security, Accessibility and QA | Claude | Implementation, security coordination, verification |
| CM5 Production Preparation and Acceptance | **Human developer** (approved preparation work) | Integration, authorised production steps, final acceptance report |

**Ten owner-facing prompts, two per milestone, unchanged.** Prompt 1 is where the owner gives
that milestone's decisions and any named authorisations. Prompt 2 is the completion report and
verification. For CM2, CM3 and CM5, Prompt 1 also releases your work packages (the one
exception is the early CM5 runbook drafting described under CM5 in part 2), and Prompt 2 is
Claude's verified report on your merged work. Your pull requests, reviews and fixes happen
between the two prompts and never become extra prompts.

**Priority inside every package:** security and data protection → data integrity →
reliability → maintainability → performance → cosmetic refinement.

**Scope tags:** FR first release, PB production blocker, PL post-launch, F future, OD owner
decision. Only FR and PB are built. A PL or F item is out of scope even if it looks small.

**Evidence labels** in every pull request and report: **Verified** (you ran or observed it),
**Reported** (someone said so), **Inferred**, **Recommended**, **Unverified**. Say where the
evidence comes from: local, sandbox (throwaway PostgreSQL), mocked API, CI, staging, production.
Sandbox and mocked results are never evidence about a hosted database.

**No real personal data and no go-live** until the CM5 evidence checklist is complete and the
owner approves go-live in writing.

### Project instructions that bind every package

- **Tenant isolation is non-negotiable.** Organisation A never reaches organisation B's
  courses, lessons, files, videos, learners, results, reports or controls. Authorisation is
  enforced in the database (row rules, checked `security definer` functions) and in Edge
  Functions, never by hiding things in the frontend, URLs, slugs or email domains. File
  storage, video, search, analytics, background jobs, exports and logs are part of isolation.
  Every package that touches data adds cross-organisation tests.
- **Design fidelity.** The approved designs are the reference. Do not restyle approved screens,
  do not invent screens and present them as designed, reuse `src/components/ui/*` and the
  tokens in `src/styles/`. A screen not covered by a design: propose a solution in the
  existing design language in the pull request and wait for the owner.
- **Accessibility.** Keyboard operation, visible focus, labels, contrast, focus trapping in
  dialogs and sheets, Escape to close. The axe checks in the e2e suites must stay clean.
- **Deferred features stay visibly unavailable** with their approved wording (P21, D24, P23).
- **Real states**: loading, empty, error, success, disabled and permission-denied.
- **No secrets, tokens, invitation links or personal data** in code, tests, logs, screenshots,
  pull requests or chat. Test data is synthetic (`*.test` addresses, "ZZ" names).
- **Do not rebuild existing features.** Extend them; ask if unsure.

---

## 2. Work packages

Each package is one pull request (or a few small ones, each naming the package ID). Start a
milestone's packages only after its Prompt 1 has released them and the decisions they depend
on are recorded in `docs/decisions.md`. The only exception is the safe, non-sensitive drafting
of the CM5-1 to CM5-4 runbooks before the CM5 gate, under the conditions set out under CM5
below.

### CM2 — Storage and Video (FR, PB)

**Decisions:** `docs/decisions.md` D39 (owner, CM2 Prompt 1). **Specification:**
`docs/cm2-implementation-package.md`. Read both before any CM2 package. Where this section and
D39 differ, D39 wins.

In short:
- public courses use the AQS-owned YouTube channel (Unlisted) after a two-gate AQS review of a
  file the instructor submits through AQS;
- organisation-only courses keep private Supabase Storage video, now with required, confirmed
  timed captions;
- there is no paid video provider and no stored YouTube credential;
- retention periods are deferred, so no deletion and no cleanup activation.

| ID | Package | Files you own | Decisions to read |
| --- | --- | --- | --- |
| CM2-1 | Video review model | new `supabase/migrations/<timestamp>_0019_video_review.sql`; `supabase/tests/database/087_video_review.test.sql`; `supabase/rollbacks/0019_video_review.rollback.sql`; additions to `supabase/tests/database/900_api_exposure.test.sql` and `scripts/db-sandbox/rollback-check.sh` | D39, D20, D21, P5, P16, P22, L11 P3, T1, T5, T8 |
| CM2-2 | Edge Functions | `supabase/functions/media-url/` (new kinds); new `supabase/functions/youtube-verify/`; unit tests; `check:functions` entry in `package.json`; `supabase/config.toml` entry with `verify_jwt = false` | D39, D20, T6 |
| CM2-3 | Submission and review screens | `src/live/data/video.ts` (new); the video section of `src/live/pages/teach/LessonPanel.tsx`; new pages under `src/live/pages/admin/` for video reviews; the organisation caption confirmation; `tus-js-client` (dependency review in the pull request); `e2e-live/live-video-review.spec.ts` (new); additions to `e2e-live/mock-supabase.ts` | D39, G14, CM1 upload rule |
| CM2-4 | Learner players | the player in `src/live/pages/learner/LiveLessonPage.tsx` and a new `src/live/components/VideoPlayer/`; `e2e-live/live-video-player.spec.ts` (new) | D39, D20, P8 |
| CM2-5 | Cleanup activation runbook (documentation only) | `docs/cm2-cleanup-activation.md` (new): describes the future activation steps with verification and rollback; opens with a "Blocked" status line; uses `<retention period: pending owner decision>` placeholders; contains no migration, schedule, secret, code or deletion script (package part 9a) | D39 (deferred items), 0017 lifecycle in `docs/agent-handoff.md` |

**Required behaviour and acceptance:** `docs/cm2-implementation-package.md`, parts 2 to 7.
You evidence the acceptance criteria in part 6 in your CM2 completion report (part 6 below).

**CM2 dependencies:**
- CM1 on `integration` (done);
- 0017 and 0018 applied to staging before 0019 (owner authorisations);
- package H before your first CM2 pull request;
- for staging tests: the owner's AQS channel URL and one Unlisted test video;
- staging uploads are capped at 50 MB on the Free plan.

### CM3 — Product and Learner Experience (FR, PB)

**Decisions needed at CM3 Prompt 1:** whether learner preview (G13), the mobile player sheet
(G15), self-hosted Inter (G24) and invitation email (G26, with its provider) are in; the owner's
content (hero photo or removal, partner logos with permission or removal, footer email and
phone). Packages marked "if approved" do not start without that decision.

| ID | Package | Files you own |
| --- | --- | --- |
| CM3-1 | One accessible confirm dialog (G16) | new `src/components/ui/ConfirmDialog/`; replace every `window.confirm` (today: `LivePlatformOrganizationDetail.tsx`, `LiveOrgMembers.tsx` ×2, `OutlinePanel.tsx`, `LessonPanel.tsx`); e2e for each |
| CM3-2 | Catalogue pagination (G30) | `src/live/pages/learner/LiveCatalog.tsx`, its data function in `src/live/data/`, the existing `src/components/ui/Pagination`; e2e-live |
| CM3-3 | Learner preview for course staff (G13), if approved | teach and learner pages it needs; must create **no** records (no enrolment, progress or attempts); e2e-live asserting no write calls |
| CM3-4 | Mobile player sheet (G15), if approved | the lesson page and a new sheet component; Overview and Documents tabs only (Notes stays deferred); focus trap, Escape, 390 px e2e |
| CM3-5 | Self-hosted Inter (G24), if approved | `index.html` (remove the Google Fonts links), `public/fonts/` (font files with their licence), `src/styles/` |
| CM3-6 | Invitation email (G26), if approved | `supabase/functions/invitations/` (send through the chosen provider; copy-link stays as the fallback); never log tokens or links; unit tests with a fake provider |
| CM3-7 | Replace invented content (G10, G11; PB) | `src/pages/LandingPage.tsx` and its CSS; a test that fails if invented content ships (see rule below) |
| CM3-8 | Three bounded refinements | inline upload status with cause-specific errors (building on CM2-3), consistent confirmations (CM3-1), content-shaped skeletons in the player and catalogue (`src/components/ui/Skeleton`) |
| CM3-9 | Defects from the owner's review of the 15 undesigned pages | only the defects the owner lists; approved designs are not restyled |

**Placeholder rule (CM3-7 acceptance):** invented content presented as real (hard-coded
"Featured courses" with invented instructors, partner logo boxes, the "Hero image placeholder")
must not appear in production: replace it with real data or remove it. The featured section
shows real published public courses and hides itself when there are none. Intentionally
unavailable features keep their approved wording. Development-only pages stay development-only
(`npm run check:build` enforces it). Synthetic staging data is allowed until CM5.

**CM3 acceptance criteria**

- No invented content in production code (a test asserts it).
- Every deferred feature uses its approved label.
- Every destructive action confirms through the one dialog.
- The learner preview creates no records.
- The mobile sheet traps focus and closes with Escape.
- axe stays clean. Screenshots at 390 px and 1440 px for every changed screen.
- Email delivery evidence, if email was chosen (staging, after authorised deployment).

**CM3 dependencies:** CM2 merged (upload status); the owner's content and decisions.

### CM5 — Production Preparation (approved preparation work only)

**Gate before CM5 Prompt 1:** legal advice and approved texts for R1–R5, AQS-owned accounts,
paid plans, the domain.

**What may start before the gate (safe, non-sensitive drafting only):** draft runbooks
CM5-1 to CM5-4 as documentation in your fork, submitted through the normal pull-request
workflow. These drafts:

- use placeholders such as `<production-project-ref>`, `<domain>` and `<secret-name>`, never
  real account identifiers, project references, URLs of production systems, secret values or
  personal data;
- describe steps without performing any of them, and contact no hosted system;
- mark every step that depends on legal advice or an owner decision as **Pending: legal
  advice** or **Pending: owner decision** (for example the breach-notification timeline in
  `incident.md`) instead of filling it in;
- are finalised, reviewed and verified only after the gate, inside CM5.

**What stays blocked until the gate is met and the owner has given the applicable explicit
approval:** CM5-5 (legal pages and age self-declaration), CM5-6 (deactivation and
anonymisation), CM5-7 (production verification and synthetic-data removal scripts), any legal
text, any production configuration, any migration, any real production action, and every other
restricted activity in part 7. Early drafting authorises none of these.

You prepare; nothing here touches production. Every production step (R-PROD) is performed
only after the owner's step-by-step authorisation, by the owner or by Claude with the owner,
using your prepared material. Claude integrates and writes the acceptance report.

| ID | Package | Files you own |
| --- | --- | --- |
| CM5-1 | Production setup runbook | `docs/runbooks/production-setup.md`: Supabase project, Render site, Google OAuth client, domain and TLS, secrets listed by name only, Auth URLs; each step with verification and rollback |
| CM5-2 | Production migration procedure | `docs/runbooks/production-migrations.md`: 0001–0013, 0014, 0015 in timestamp order, then 0016, 0017, 0018, 0019 and later; read-back after each step |
| CM5-3 | Backups and restore drill | `docs/runbooks/backup-restore.md`: daily backups, a separate Storage copy, a timed restore drill with its log template |
| CM5-4 | Monitoring and incidents | `docs/runbooks/monitoring.md` and `docs/runbooks/incident.md`; the breach-notification timeline is **only** what legal advice confirms (the 48-hour figure is Unverified) |
| CM5-5 | Legal pages and age self-declaration | public routes and pages with the **approved** texts only; the age self-declaration as legal advice requires; any database change as a new migration with pgTAP tests |
| CM5-6 | Deactivation and anonymisation (F8, R4) | the approved procedure as checked database functions in a new migration, pgTAP tests (including cross-organisation and audit rows), and `docs/runbooks/anonymisation.md` |
| CM5-7 | Production verification and synthetic-data removal | `scripts/production-verification/` (read-only checks mirroring the staging checks) and a reviewed removal script for synthetic data; both run only under authorisation |

**CM5 acceptance:** the twelve-row production blocker checklist (part 7) evidenced, UAT signed
off by AQS staff, and the owner's written go-live approval. Claude assembles the evidence and
the report; you supply the prepared material and fix review findings.

---

## 3. File and component ownership

**Rule: one owner per file at a time. No overlapping implementation.**

| Area | CM2–CM3 (you) | CM4 (Claude) | CM5 (you prepare, Claude integrates) |
| --- | --- | --- | --- |
| Files named in your packages above | You | Read-only for Claude except review fixes you agree to | You |
| `supabase/migrations/` 0001–0018, `supabase/rollbacks/` 0014–0018 | Never edit | Claude | Never edit |
| Your new migrations (0019, 0020 if CM3 needs one; CM5: 0022 and later) | You | — | You |
| CM4 index migration (0021) and CM4 test files | — | Claude | — |
| `docs/decisions.md`, `CLAUDE.md`, `docs/agent-handoff.md`, `docs/cm*-authorisation-packages.md` | Propose changes in the PR description; Claude writes them | Claude | Same |
| Shared files: `package.json`, `e2e-live/mock-supabase.ts`, `supabase/tests/database/900_api_exposure.test.sql`, `supabase/config.toml`, `scripts/db-sandbox/*` | Additions only, each listed in the PR | Additions only | Additions only |
| `.github/workflows/ci.yml`, `render.yaml` | Never (protected; owner only) | Package for the owner | Package for the owner |
| `src/components/ui/*` existing components | Extend without changing existing props or looks; new components allowed | — | — |

**Migration numbers are reserved:** 0019 CM2 (video), 0020 CM3 (only if needed), 0021 CM4
(Claude, indexes), 0022+ CM5. Timestamps must sort after the previous migration. A migration
that is committed but not yet applied is still never edited by anyone other than its owner;
changes go in a new migration with `create or replace`.

**Dependencies between packages:** CM2-1 → CM2-2 → CM2-3 and CM2-4; CM2-3 → CM3-8; CM3-1 →
CM3-8; CM2 merged → CM3 starts; CM3 merged → CM4 (Claude, feature freeze) → CM5. During CM4 you
make no feature changes; you fix only findings Claude assigns to you in review. The early CM5-1
to CM5-4 runbook drafting (part 2, under CM5) is documentation only and may continue at any time
under its conditions; every other CM5 package waits for the CM5 gate and Prompt 1.

---

## 4. Tests and evidence for every package

Run all of these before asking for review and paste the counts (not logs) into the pull
request. CI runs the same checks on your fork and on the pull request.

```bash
npm ci
npm run lint
npm run build && npm run check:build
npm run test:unit
npm run test:functions
npm run check:functions
npm run test:e2e          # design previews, includes axe checks
npm run test:e2e:live     # live screens against a mocked Supabase API
npm run test:db           # throwaway PostgreSQL sandbox (Linux or WSL2, non-root user, PostgreSQL 16 + pgTAP)
bash scripts/db-sandbox/rollback-check.sh   # every migration with a rollback
```

If you cannot run `test:db` locally, the CI database job on your fork is acceptable evidence:
link the run.

| Package kind | Evidence required in the PR |
| --- | --- |
| Any migration | pgTAP file with: positive cases, refusals for non-staff, learners and signed-out callers, **cross-organisation refusals**, `security definer` + `search_path=''` checks, grants (`900_api_exposure` updated); full sandbox count; rollback script and `rollback-check.sh` PASS; a statement of which existing functions it replaces and that their earlier behaviour still passes |
| Edge Function | unit tests for every refusal path (no session, wrong organisation, bad signature, replayed webhook, unknown asset); `check:functions` pass; list of environment variable **names** it reads |
| Frontend screen | e2e-live tests for success, failure and permission-denied; axe clean; screenshots at 390 px and 1440 px with synthetic data; a note on design fidelity (which approved design it follows, or "not designed: proposal") |
| Data integrity rule | a failure-path test that fails on the old code (say so, as CM1 did) |
| Runbook (CM5) | every step has the exact command or screen, the expected result, verification and rollback; no secret values |

---

## 5. Git workflow: fork, branches and pull requests

**Upstream repository:** `https://github.com/owenganza01/aqs-learning-platform.git`.
**Integration branch:** `integration` on upstream. It is the only base for your work and the
only target of your pull requests. CM1 is on it at commit `9176499`
(`917649990c9d31f68cb9d86ba74e9eaa0c5c6caf`, pushed by the owner on 3 November 2026).
**Never target `feature/first-release`:** every commit on that branch deploys staging
automatically. Claude promotes reviewed work from `integration` to `feature/first-release` only
when the owner authorises that push and its deployment.

**Always branch from `upstream/integration`.** Every CM2, CM3 and CM5 work branch is created
from a freshly fetched `upstream/integration`, never from your fork's own branches, which can be
out of date (a fork made earlier may still hold `feature/first-release` at `4375371`, without
CM1).

1. Fork upstream on GitHub with **all branches** (untick "Copy the master branch only").

2. Clone your fork. Run each command on its own line, replacing `<your-github-username>`:

```bash
git clone https://github.com/<your-github-username>/aqs-learning-platform.git
cd aqs-learning-platform
```

3. Add the upstream repository and fetch it:

```bash
git remote add upstream https://github.com/owenganza01/aqs-learning-platform.git
git fetch upstream
```

4. Check that you have the integration branch with CM1 on it. The first command must list
   `upstream/integration`; the second must print a commit at or after `9176499`:

```bash
git branch -r
git log --oneline -1 upstream/integration
```

5. Create each work branch from `upstream/integration` (one branch per package). For example:

```bash
git fetch upstream
git switch -c cm2/CM2-1-video-review upstream/integration
```

Name branches `cm2/<package-id>-<short-name>`, `cm3/...` or `cm5/...`. Before the CM5 gate, a
`cm5/` branch may contain only the CM5-1 to CM5-4 runbook drafts allowed under CM5 in part 2:
documentation with placeholders, nothing that is legal text, production configuration, a
migration or a production action.

6. Commit in small steps, Conventional Commits, explicit paths only, for example:

```bash
git add supabase/migrations/<file> supabase/tests/database/087_video_review.test.sql
git commit -m "feat(db): video review model (CM2-1)"
```

Never `git add .` or `git add -A`. Never commit `.env*` files other than `.env.example`.

7. Stay current with upstream while you work. Run each command on its own line:

```bash
git fetch upstream
git merge upstream/integration
git push origin cm2/CM2-1-video-review
```

Push only to your fork (`origin`). Never push to `upstream`. Never force-push a branch that
has an open pull request.

8. Open the pull request **from your fork's branch into upstream `integration`**, using the
   template in `docs/pull-request-template.md` (paste it into the description; once the owner
   copies it to `.github/pull_request_template.md`, GitHub fills it in automatically). One
   package per pull request; draft pull requests are welcome for early direction.
9. Claude reviews (read-only) for architecture consistency, security, isolation, design
   fidelity and evidence. You fix in new commits on the same branch.
10. **Merging needs the owner's authorisation.** The owner merges in GitHub, or authorises
   Claude to merge that named pull request. Merge commits, no squash, so the evidence trail
   stays. No one merges their own pull request without that authorisation.
11. After a merge, start the next package from a freshly fetched `upstream/integration`
    (step 5). To keep your fork's own `integration` branch in step as well:

```bash
git fetch upstream
git switch integration
git merge --ff-only upstream/integration
git push origin integration
```

If `git switch integration` says the branch does not exist, create it first with
`git switch -c integration upstream/integration`.

---

## 6. Progress reporting and handing work over

- **Each pull request** carries its package ID, the evidence table above, and open questions.
- **Progress file per milestone:** update `docs/progress/cm2.md` (then `cm3.md`, `cm5.md`) in
  each pull request: one row per package with status (Not started, In progress, In review,
  Changes requested, Merged), pull request link and evidence summary.
- **Blockers and decisions:** raise them in the pull request or a GitHub issue labelled
  `decision-needed` and tell the owner. Never decide a product, security or legal question
  yourself; never work around a restriction.
- **A conflict with an approved decision or design:** stop, describe it, recommend an option,
  wait.
- **Milestone report (required at the end of CM2, CM3 and CM5):** open an issue in the
  upstream repository titled "CMx completion report" containing:
  - the requirements and deliverables completed, by package;
  - the files changed (pull request links);
  - the tests actually executed, with commands and counts, and CI run links;
  - for each acceptance criterion, the evidence that it is met;
  - outstanding issues, risks and dependencies;
  - work intentionally deferred.
- **Progression (owner, 3 November 2026): you work autonomously to the end.**
  - Order: CM2 → CM3 → CM5. You do not wait for Claude's or the owner's confirmation between
    milestones. When a milestone's acceptance criteria are evidenced in its report, start the
    next one.
  - CM4 (security, accessibility and QA) belongs to Claude and is not yours. Make no feature
    changes once CM3 is finished, other than what CM5 requires.
  - If a pull request you depend on is not merged yet, branch the next package from your own
    previous branch, and say so in the new pull request. Merges are done by the owner, at the
    end or as the owner chooses (part 5).
  - **Stop only the affected work** for a genuine blocker, an unresolved product decision, a
    security issue, a legal dependency or a step that needs an owner-authorised action (part 7).
    Record it in the report and continue with everything else.
  - Acceptance evidence that needs staging (owner-authorised migrations, deployments, the AQS
    channel URL or test video) is listed in your reports as "pending owner action", not as done.
  - CM5 items behind the gate (CM5-5 to CM5-7) are reported as blocked unless the gate is met.
- **Final report (when you have finished):** open one issue titled
  "Developer milestones final report". It links the three milestone reports and gives, per
  milestone:
  - status;
  - pull requests;
  - test results with CI links;
  - acceptance evidence;
  - open issues, risks and pending owner actions.

  This is the report the owner reads.
- **Security finding:** report it privately to the owner (not in a public issue), with the
  affected files; do not include exploit details in public text.

---

## 7. Restrictions (identical to Claude's; nothing here is negotiable)

You need **no** Supabase keys, staging access, Render access or Google credentials for any
package. Do not ask for them and do not use any you come across.

| You must never | Instead |
| --- | --- |
| Push to upstream, push to `feature/first-release` or `master`, merge any pull request, delete branches or rewrite shared history | Push to your fork; open a pull request into `integration`; the owner merges or authorises a merge |
| Apply a migration to any hosted database; run `supabase link`, `supabase db push`, `supabase config push` or `supabase functions deploy` | Write the migration, test it in the sandbox, document it; the owner authorises, and Claude or the owner applies it |
| Deploy anything (Render, Edge Functions, provider configuration) or trigger a deploy | Prepare a package: target, effect, commands, verification, rollback |
| Change hosted configuration (Auth, Storage limits, schedules, plans, DNS, OAuth, YouTube channel or provider dashboards) | Same: a package for the owner |
| Create, read, print, commit or share secrets, tokens, keys, invitation links or personal data | Name environment variables only; use fakes in tests |
| Access protected systems: the Supabase project `eeoofujuouquhnxkpffs`, the owner's local containers and volumes (`supabase_db_aqs-platform`, `aqs-postgres`, `aqs-migration-rehearsal-20261029`), or any database other than the throwaway sandbox | The sandbox (`npm run test:db`) |
| Edit `.github/workflows/ci.yml` or `render.yaml` | Propose the diff in the pull request |
| Edit migrations 0001–0018 or `docs/decisions.md` | New migration with `create or replace`; propose decision changes |
| Use real personal data, real organisations or real learners anywhere | Synthetic `*.test` data |
| Add a paid service, a new third-party script or a new subprocessor | Ask the owner first; it needs a decision and legal review (RB1) |
| Start PL or F items, or reopen M1–M5 | Note them as follow-ups |

**Production blocker checklist (CM5, for reference):** RB1 legal and privacy · RB2 production
environment · RB3 migrations 0014 and 0016 · RB4 integrated code deployed · RB5 orphaned-file
cleanup · RB6 second Platform Admin · RB7 invitation delivery · RB8 storage plan and limits ·
RB9 upload integrity · RB10 video and captions · RB11 real public content · RB12 operations.
Each needs its completion condition met and its evidence filed (audit report section 26).
