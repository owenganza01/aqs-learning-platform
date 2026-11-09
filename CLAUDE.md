# AQS Learning Platform — agent instructions

Read first, every session: `docs/agent-handoff.md` (current state and next action), then only the parts of `docs/decisions.md` that the task touches. `docs/decisions.md` is the authoritative product record; never contradict or duplicate it.

## Stack and layout
React 19 + TypeScript + Vite (`src/`, live app in `src/live/`), Supabase (Postgres, RLS, Auth, Storage, Edge Functions in `supabase/functions/`), Render static site (`render.yaml`). Migrations: `supabase/migrations/` (applied ones are never edited, T1). Tests: `supabase/tests/database/` (pgTAP), `supabase/functions/_shared/core.test.mjs`, `e2e/` (preview), `e2e-live/` (live mode, mocked API), `tests/api/`.

## Commands
- `npm run lint` · `npm run build`
- `npm run test:db` — throwaway PostgreSQL 16 sandbox, never a real database (must run as a non-root user)
- `npm run test:functions` · `npm run test:unit` · `npm run test:e2e` · `npm run test:e2e:live`
- `npm run check:functions` (Deno type-check of Edge Functions) · `npm run build && npm run check:build` (production-build boundary: no dev pages, sample data or secrets)
- Report counts only (passed/failed), not full logs.

## Hard rules (owner approval required for each)
- No `git push`, merge, branch deletion or history rewrite. Local commits are allowed during an approved milestone (OD14): small, grouped, Conventional Commits, explicit paths only (never `git add .`/`-A`).
- Never commit `.claude/settings.local.json` or `docs/archive/` (owner decision pending).
- No migrations applied to any hosted database, no hosted Auth/config/secret changes, no Edge Function or Render deploys.
- Staging (`aqs-staging`, ref `txpaszokduxewyojrnmq`): synthetic "ZZ Test" data only, logged in the handoff (OD15). Never touch the Supabase project `eeoofujuouquhnxkpffs`, never `supabase link`, never start Docker Desktop.
- Never handle Google credentials; the owner signs in. Never print tokens, invitation links, keys or personal data.
- Frontend checks are user experience only; the database is the security boundary (D21, D27).
- Do not rebuild existing features; verify them. Deferred features stay visibly unavailable (P21, D24).

## Evidence language
Label results as repository, sandbox, staging or production evidence. "Reported" is never "verified".

## Delivery rule (owner, 2 November 2026; M1–M5 complete)
M1–M5 are closed. Their rule (two owner-facing prompts per milestone, owner actions batched into one decision list) is superseded by the completion programme below for all remaining work.

## Completion programme (owner-approved 3 November 2026)
Source: Claude Project audit doc "AQS Comprehensive Audit and Production Readiness Report", section 26.
- Five completion milestones, no others: CM1 Integration and Critical Fixes · CM2 Storage and Video · CM3 Product and Learner Experience · CM4 Security, Accessibility and QA · CM5 Production Preparation and Acceptance. M1–M5 and deferred features are not reopened.
- Exactly two owner-facing prompts per milestone (ten in total): Prompt 1 implementation (owner gives decisions and any named authorisations), Prompt 2 completion report and verification. Internal tasks, fixes, tests, reviews and verification never become extra prompts.
- Approving the roadmap or a milestone authorises local engineering, sandbox tests and local commits only. Every restricted action needs its own explicit, named owner authorisation: push, merge, staging or production deployment, applying a migration, Edge Function deploys or secrets, hosted configuration, destructive operations, protected systems. Prepare each as a package (target, effect, commands, verification, rollback); if not authorised, it waits and is reported in Prompt 2.
- Pushing `feature/first-release` deploys staging (Render auto-deploy, verified 3 Nov): push that branch only when the deployment is also authorised; push-only goes to a separate review branch Render does not watch; neither means the work stays local.
- Migration 0014 only after a frontend that uses `course_people` is deployed and confirmed live. Staging order: 0014 (out of timestamp order, recorded), 0016, 0017, 0018. 0017's cleanup function is never deployed or scheduled before CM2.
- Priority in every milestone: security and data protection, data integrity, reliability, maintainability, performance, then cosmetic refinement. Only first-release and production-blocker items are built.
- **Work allocation (owner, 3 November 2026):** CM1 Claude · CM2 human developer · CM3 human developer · CM4 Claude (implementation, security coordination, verification) · CM5 human developer for the approved preparation work, Claude for integration and final acceptance. Same prompts (ten), same rules, one project. The developer works only through his fork and pull requests into the upstream `integration` branch (never `feature/first-release`, which deploys staging). Claude owns architecture consistency, review and integration, and never implements a package assigned to the developer. Ownership, packages and the Git workflow: `docs/developer-handoff.md`.
- No real personal data and no go-live until CM5's evidence checklist is complete and the owner approves go-live in writing. Nothing follows CM5.
