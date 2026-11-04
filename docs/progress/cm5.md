# CM5 progress (Production Preparation) — preparation owner: human developer; integration and acceptance: Claude

Before the CM5 gate (legal texts R1–R5, AQS-owned accounts, paid plans, domain), CM5-1 to CM5-4 may begin only as safe, non-sensitive documentation drafts, using placeholders and performing no actions. Their finalisation and verification, and all of CM5-5 to CM5-7, stay gated as specified in `docs/developer-handoff.md` (part 2, CM5). Every production action needs the owner's applicable explicit, step-by-step approval.

| Package | Status | Pull request | Evidence summary |
| --- | --- | --- | --- |
| CM5-1 Production setup runbook | Draft in review | [#19](https://github.com/owenganza01/aqs-learning-platform/pull/19) | Placeholders only; Pending items for the gate |
| CM5-2 Production migration procedure | Draft in review | [#22](https://github.com/owenganza01/aqs-learning-platform/pull/22) | Placeholders only; timestamp order on the empty production project (owner to confirm) |
| CM5-3 Backups and restore drill | Draft in review | [#20](https://github.com/owenganza01/aqs-learning-platform/pull/20) | Placeholders only; separate Storage copy; timed drill and log template |
| CM5-4 Monitoring and incidents | Draft in review | [#21](https://github.com/owenganza01/aqs-learning-platform/pull/21) | Placeholders only; breach timeline Pending: legal advice (48 h Unverified) |
| CM5-5 Legal pages and age self-declaration | Blocked (CM5 gate) | — | Legal texts R1-R5 not approved |
| CM5-6 Deactivation and anonymisation | Blocked (CM5 gate) | — | Approved procedure (F8, R4) not available |
| CM5-7 Production verification and synthetic-data removal | Blocked (CM5 gate) | — | When unblocked: reuse tests/api/staging-checks.mjs (owner) |
