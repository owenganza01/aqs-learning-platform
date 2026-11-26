# Review fixes — second pass over the combined patch, 23 November 2026

**Base:** GitHub `integration` at `5be29c6` + `aqs-2026-11-23-combined.patch` (applied cleanly). **Result:** one uncommitted working tree, delivered as `aqs-2026-11-23-combined-v2.patch` (complete, against `5be29c6`) and `aqs-2026-11-23-review-fixes.patch` (only this pass, against the first patch).
**Evidence labels:** *local* = cloud workspace; *sandbox* = throwaway PostgreSQL 16 + pgTAP with the Supabase stand-in; *mocked* = Playwright in system Chrome against the mocked Supabase API. **Nothing here is staging or production evidence.** Nothing was committed, pushed, applied, deployed or configured; no email was sent.
**Scope:** P1–P11 and D43 (A1–A15) unchanged. No prompt, task or product decision was added or changed. Migrations 0024–0028 are unapplied everywhere, so they were corrected in place (T1 applies to applied migrations only).

## 1. The seven review findings

| # | Finding | Verdict | Evidence before the fix | Fix | Evidence after |
|---|---|---|---|---|---|
| 1 | Email webhook arrives before the provider message id is recorded | **Confirmed defect.** `email_record_event` answered `unknown_message`, the webhook returned 200, so Resend never retried and the event was lost. | New sandbox race check on the original 0024: **25 of 40** "delivered" events lost (15 recorded, 25 `unknown`) | 0024: `private.email_held_events`; an event for an unknown id is **held**; `email_mark_accepted` applies held events in order in the same transaction; both take one advisory lock per provider id, so no event can fall between; `email_reconcile_held_events` (run by `email-send` first every run) applies any left over and expires events held over 7 days (kept for inspection). `email_mark_accepted` also accepts a late report (claim reclaimed or failed) and is idempotent for the same id; `email-send` retries a transient error recording acceptance (3 tries), so the email is not re-sent | Race check **40/40 delivered, 0 held, 0 errors** (20 events arrived first and were held, 20 after); pgTAP `100_review_fixes` (held, ordering, duplicates, late report, sweep, expiry, privileges); function tests |
| 2 | Approval when the approving Platform Admin is a named administrator | **Confirmed defect.** Their address was skipped, so the workspace was activated with fewer invitations than named (C2 violated) | `098_onboarding_activation` asserted the skip | Approval is refused as a whole with a clear message when the approver is any of the named administrators; another Platform Admin approves and every named person is invited. Defensive check: one pending Org Admin invitation per named administrator or nothing is approved. Duplicates removed before inviting. The role is still granted only by accepting with the matching verified Google identity (D33, unchanged) | pgTAP: refusal leaves no organisation, no invitation, request still in review; a second Platform Admin's approval invites both (incl. the first approver) and queues both emails; concurrency check 12/12 |
| 3 | Deployment order: new `organisation-request` vs the old form | **Confirmed defect** (and wider than reported): after 0025 was applied, even the **old** function failed with the old form, because the database itself required the 0025 fields | — | The 0021 form (no `form_version`) is accepted by both 0025 and the new function with **0021's own rules** (old phone rule, administrators optional, no documents, no terms invented: stored as null). The new form sends `form_version: 2` and keeps every 0025 check; unknown versions ask for a reload. Admin request page labels such requests ("Sent with the earlier request form… confirm before approving"). Pack 4 order rewritten: only "frontend before function" is unsafe | pgTAP (legacy accepted, stored without new fields, documents refused, unknown version refused, v2 still strict); 4 function tests |
| 4 | Body size relies on `Content-Length` | **Confirmed defect.** `email-webhook` read the whole body before checking; `organisation-request` called `req.formData()`/`req.json()` after a header-only check; every other function (`serve()`) had no limit | — | `_shared/core.ts readBodyLimited`: refuses early when the header is already too large, otherwise counts the bytes as they arrive and cancels the stream past the limit (absent, malformed or understated headers make no difference). Used by `serve()` (64 KB JSON for all functions), `email-webhook` (64 KB) and `organisation-request` (64 KB JSON; 51 MB multipart, parsed from the limited bytes) | 7 new tests incl. chunked bodies without `Content-Length`, an understated header, and a 51 MB+ multipart stream stopped after ≤ 8 × 8 MB; Deno type-check (it caught a shadowed variable in my first draft of this fix, in code the Node tests did not reach; fixed, and the reading code moved into `request.ts` so it is now unit-tested) |
| 5 | Invitation emails bypass the outbox | **Confirmed.** `invitations` called Resend directly: one attempt, no retry, no tracking | — | `invitations` now creates the invitation as the caller (unchanged) and calls `queue_invitation_email` as the caller (creator only, pending/unexpired, organisation not suspended, once per invitation; Org Admin invitations use the Org Admin template). No token is stored: `email-send` mints it at send time, as for approval invitations. No email configured or queuing fails → link returned once (old behaviour, also safe before 0024). Org Admin "Invitations" page: new **Email status** column (Sending/Sent/Delivered/Bounced/Marked as spam/Not sent) from `invitation_email_status` (Org Admins of that organisation, Platform Admins; ≤ 200 ids); "on its way" message; no link for queued invitations | pgTAP (who may queue and see; no token in the outbox; revoked refused); 5 function tests (incl. no direct provider call); 4 mocked e2e tests |
| 6 | Recharts bundle figures disagree | **Confirmed inconsistency** (114.0 / 112 kB; +0.8 / +1.1 kB). Cause: different methods (Vite's printed column vs. file sums, JS only vs. JS+CSS) | — | `scripts/measure-bundle.mjs`: sizes of the emitted files, gzip level 9, kB = 1,000 bytes | See section 3 |
| 7 | Skipped live tests and other gaps | **Explained and run where safe** | 126 skipped | The 126 "skips" are the CM3-9 screenshot set, gated on `CM3_9_SCREENSHOTS=1` (images for review, no assertions beyond loading). Run in this pass | See section 4 |

## 2. Further defects found and fixed in this pass

| Defect | Fix | Evidence |
|---|---|---|
| Org Admin dashboard, Members page and the course-assignment picker read members/invitations in one request, which stops silently at the Data API's 1,000 rows (listed as open in the first report) | `src/live/paging.ts collectPages`: every page, stable order; inactive memberships counted by the database (`count: 'exact'`) | 4 unit tests (2,500 rows read in 3 requests) |
| `course_people(uuid[])` accepted arrays of any length (same shape as P10 L3; listed as open) | 0028: same 200-id bound and error; frontend asks in batches of 200; rollback restores 0014's body | pgTAP 280 (+2); rollback check 0028 PASS |
| New "Email status" column first shipped as "Email", a second column with the same name as the address column (caught by the new e2e test) | Renamed "Email status" | mocked e2e |

## 3. Bundle measurement (finding 6) — production build of this tree, local

| What | Raw | gzip |
|---|---|---|
| Initial load, JavaScript (entry + preloaded chunks) | 325.8 kB (base `5be29c6`: 324.2) | **103.6 kB** (base: 102.6) → **+1.1 kB** |
| Initial load, JavaScript + CSS | 372.4 kB (base: 371.8) | 113.3 kB (base: 112.4) |
| Recharts chunk `BarChartPlot-*.js` (lazy, dashboards only) | 398.7 kB | **112.6 kB** (+0.4 kB CSS = 113.0 kB) |

Method: `npm run build && node scripts/measure-bundle.mjs` (emitted files, Node zlib gzip level 9, kB = 1,000 bytes). Vite's own printed gzip column runs about 1 % higher for the same files (113.95 kB for the chart chunk, 80.02 kB for `index`), which is where the first report's 114.0 kB came from; its "+0.8 kB" came from a mix of Vite-column figures. The chart chunk is referenced only from the lazy import in `BarChart.tsx`; pages without a chart never load it. The Chart.js comparison figure (53.4 kB) was not re-measured (Chart.js is not installed).

Chart consistency: every dashboard and report chart (Org Admin ×3, Teaching Studio ×2, Platform ×2, and their preview pages) uses the one `BarChart` component: table alternative always in the page and toggleable, reduced motion respected, labels wrap and stack below the breakpoint, values printed on the bars, colours from tokens. No other chart implementation remains.

## 4. Test totals on the final tree

| Suite | Passed | Failed | Skipped | Kind |
|---|---|---|---|---|
| Database (pgTAP), 34 files | **1,801** (first pass 1,749) | 0 | 0 | sandbox |
| Rollback check (0014, 0016–0028) | **14/14** | 0 | — | sandbox |
| Webhook race check (new) | **4/4** | 0 | — | sandbox (fails 2/4 on the first patch: 25 of 40 events lost) |
| Onboarding concurrency check | **12/12** | 0 | — | sandbox |
| Domain admission concurrency check | PASS | 0 | — | sandbox |
| Edge Function tests | **127** (first pass 107) | 0 | 0 | local, mocked provider |
| Unit | **92** (first pass 88) | 0 | 0 | local |
| Staging-check guard test (no network) | 1 | 0 | 0 | local |
| Deno type-check, all 11 functions | pass | — | — | local |
| Lint, type-check, build, production-build check | pass | — | — | local |
| e2e live (mocked API), full suite (599 collected) | **473** | 0 | 126 (the screenshot set, run below) | mocked |
| e2e live, screenshot set (`CM3_9_SCREENSHOTS=1`; 390/768/1440 px) | **126** | 0 | 0 | mocked |
| e2e live, new `live-invitation-email` spec + invitation-related specs re-run after the column rename | **102** (incl. 4 new) | 0 | 0 | mocked |
| e2e preview, full suite | **491** | 0 | 0 | local (system Chrome) |

The full live suite ran before the new spec existed and before the "Email status" rename; the five specs that touch invitations (102 tests) were re-run afterwards. The screenshot set covers 390, 768 and 1440 px for every live screen; the Org Admin invitations page was checked by eye at 390 and 1440 px (new column fits; phone cards show "Email status"). Playwright's browser download is blocked here, so the suites ran in the installed Chrome through untracked local configs that only set `channel: 'chrome'` (not part of the patch).

Not run: **real-Storage sandbox** (`run-real-storage.sh` needs PostgreSQL 17; only 16 is installable here — the pinned Storage source was fetched and verified); **staging checks** (`npm run test:staging`, needs staging and owner tokens: not authorised); everything needing Resend, hosted Storage, the Edge runtime or staging.

## 5. Changed in this pass (against the first patch)

- **Migrations (unapplied, edited in place):** `0024_email_outbox.sql` (held events, late acceptance, `email_reconcile_held_events`, `queue_invitation_email`, `invitation_email_status`), `0025_onboarding_activation.sql` (approval refusal and invitation-count check; 0021 form accepted), `0028_security_fixes.sql` (`course_people` bound). Rollbacks 0024 and 0028 updated.
- **Edge Functions:** `_shared/core.ts` (`readBodyLimited`, `readJsonLimited`), `_shared/http.ts` (`serve()` limit), `email-webhook/index.ts`, `email-send/send.ts`, `organisation-request/index.ts` + `request.ts` (legacy form, `readSubmission` moved here and limited), `invitations/index.ts` + new `invite.ts`.
- **Frontend:** `src/lib/workspace-request.ts` (`form_version: 2`), `src/live/paging.ts` (new), `src/live/data/orgAdmin.ts`, `src/live/data/authoring.ts`, `src/live/pages/manage/LiveOrgInvitations.tsx`, `src/live/pages/teach/CoursePanels.tsx`, `src/live/pages/admin/LiveOrganizationRequestDetail.tsx`.
- **Tests:** new `supabase/tests/database/100_review_fixes_2026_11_23.test.sql`, `supabase/functions/invitations/invite.test.mjs`, `tests/unit/paging.test.mjs`, `e2e-live/live-invitation-email.spec.ts`; updated 095, 098 ×2, 280, 281, 900, `core.test.mjs`, `send.test.mjs`, `webhook.test.mjs`, `request.test.mjs`. Changed expectations, each for a fixed defect: 098 `unknown_message` → `held` (finding 1); 098 "own address skipped" → refused (finding 2); allow-lists in 281/900 gained the three new functions; payload fixtures gained `form_version: 2` (finding 3). No assertion was removed or weakened.
- **Scripts:** new `scripts/db-sandbox/email-webhook-race-check.sh`, `scripts/measure-bundle.mjs`; `onboarding-concurrency-check.sh` fixture; `package.json` (`test:db:email-race`, `test:db:onboarding-concurrency`, `test:db:rollback`, invite tests).
- **Docs:** `docs/staging-update-pack-4.md` (order, checks, `invitations` redeploy), `docs/runbooks/email-delivery.md`, superseded notes in `FINAL-REPORT.md`, `WS-ONBOARD.md`, `WS-EMAIL.md`, `WS-CHARTS.md`, this file.

## 6. Reproduce

```bash
npm ci
npm run lint && npm run build && npm run check:build && node scripts/measure-bundle.mjs
npm run test:unit && npm run test:functions && npm run check:functions
# as a non-root user (throwaway clusters, socket only):
npm run test:db && npm run test:db:rollback && npm run test:db:email-race && npm run test:db:onboarding-concurrency && npm run test:db:concurrency
npm run test:e2e && npm run test:e2e:live          # Playwright browsers, or a local config with channel: 'chrome'
CM3_9_SCREENSHOTS=1 npx playwright test -c playwright.live.config.ts e2e-live/cm3-9-screenshots.spec.ts
```

## 7. Still open (not fixed here)

- React "unique key" console warning on the Platform organisation detail page (first report): not reproduced in this pass; source still unidentified. Cosmetic, not a blocker.
- Course-level documents, certificate revocation/re-issue, backfill for earlier completions, an AQS template for platform courses, non-Latin fonts, retention (L6/R4), privacy-policy wording for certificates and request documents: unchanged from the first report; product or owner items.
- Optional: remove the 0021-form compatibility path once the new frontend has been live on staging and production (a later, separately approved change).
