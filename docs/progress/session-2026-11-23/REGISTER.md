# Live progress register — parallel implementation session, 23 November 2026

Base: GitHub `integration` at `5be29c6`. Work is uncommitted (owner rule). Evidence labels: **local** (this workspace), **sandbox** (throwaway PostgreSQL 16 + pgTAP), **staging**, **production**. Nothing in this session touched staging or production.

## Baseline (5be29c6, before any change)
| Suite | Result | Kind |
|---|---|---|
| Database (pgTAP) | 1,367/1,367 (27 files) | sandbox |
| Unit | 70/70 | local |
| Edge Function helpers | 53/53 | local |
| Lint, build | pass | local |
| e2e preview, accessibility spec | 72/72 (system Chrome; Playwright's browser download is blocked here) | local |

## Workstreams
| WS | Task IDs / requirement | Status | Migration | Depends on | Authorisation needed (operational only) |
|---|---|---|---|---|---|
| Coordinator | A1 decision record (D43) | Done — `docs/decisions.md` | — | — | Merge |
| WS-CHARTS | A2 (C4; 7-2 reopened, 7-3–7-6), A8 (Part 7), A14 (Part 10.3) | Done — local/sandbox verified, staging not run | — | — | Merge |
| WS-EMAIL | A3, A4 infrastructure (Part 6) | Done — local/sandbox verified, staging not run | 0024 | — | Resend domain verification, secrets, apply 0024, deploy `email-send`/`email-webhook`, schedule |
| WS-ONBOARD | A5, A6 (C2; 3-4, 3-6 reopened), P10 M1 + L1 (Q-9) | Done — local/sandbox verified, staging not run | 0025 | 0024 (stub until integration) | SQL approval, apply 0025, redeploy `organisation-request` |
| WS-CERT | A11 (Part 11) | Done — local/sandbox verified, staging not run | 0026 | 0024 (stub) | SQL approval, apply 0026, deploy functions, secret, schedule |
| WS-UPLOAD | A10 (Parts 9.3, 9.4) | Done — local/sandbox verified, staging not run | 0027 if needed | — | SQL approval if 0027 |
| WS-SEC | A9 (C3, Part 8), A7 (Parts 10.1–10.2), P10 L3 + L4 + I1 (Q-9) | Done — local/sandbox verified, staging not run | 0028 | — | SQL approval, apply 0028 |
| WS-RESEARCH | A12 (Parts 2.3, 2.4, 3, 14) | Done — local/sandbox verified, staging not run | — | — | — |
| Coordinator | A13 performance, A15 update-4 runbook | Done — A13 measured (no defect), A15 runbook written | — | All above | Owner runs update 4 |

Plan prompts outside this session's reach: P2 staging actions (owner), P6 content (owner), P7 providers + D42 (owner), P9 checks after update 4.

## Final
See `FINAL-REPORT.md` in this folder. Combined tree: database 1,749/1,749; unit 88/88; functions 107/107; preview e2e 491/491; live e2e 472 passed, 126 skipped, 1 fixed and re-run.

## Second pass — review fixes (23 November 2026, evening)
| Item | Status | Migration | Authorisation needed (operational only) |
|---|---|---|---|
| Finding 1 webhook race (held events) | Done — sandbox race check 40/40, pgTAP | 0024 (edited, unapplied) | Same as 0024 |
| Finding 2 approver named as administrator | Done — refused as a whole, pgTAP | 0025 (edited, unapplied) | Same as 0025 |
| Finding 3 request-form rollout compatibility | Done — 0021 form accepted with 0021 rules | 0025 + `organisation-request` | Same as 0025; pack 4 order updated |
| Finding 4 body limits while reading | Done — all functions | — | Function redeploys in pack 4 |
| Finding 5 invitation emails via the outbox | Done — `queue_invitation_email`, status column | 0024 + `invitations` | `invitations` redeploy added to pack 4 |
| Finding 6 bundle figures | Reconciled — `scripts/measure-bundle.mjs` | — | — |
| Finding 7 test gaps | Screenshot set run; remaining skips explained | — | Staging checks need pack 4 |
| 1,000-row lists (Org Admin pages), `course_people` bound | Done | 0028 (edited, unapplied) | Same as 0028 |
Details: `REVIEW-FIXES.md`.
