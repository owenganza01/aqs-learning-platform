# Monitoring (CM5-4) — DRAFT

**Status: draft written before the CM5 gate. Nothing in it is authorised or has been performed.** Creating alerts, integrations or webhooks on any hosted system needs the owner's explicit approval. No new paid service or subprocessor is added without an owner decision and legal review (RB1).

Placeholders:
- `<production-project-ref>`, `<domain>`, `<render-service-name>`;
- `<alert-email>`: an AQS-owned mailbox;
- `<on-call>`: a named AQS role, not a person's private address.

## 1. What is watched
| Signal | Where (no new service) | Check | Threshold | Action |
| --- | --- | --- | --- | --- |
| Site up | Render → `<render-service-name>` → Events and Metrics | the latest deploy is "Live"; `https://<domain>` answers 200 | down > `<5 min>` | incident S1 (`incident.md`) |
| Database health | Supabase → Reports → Database | CPU, memory, connections, disk | > `<80 %>` for `<15 min>` | incident S2 |
| Auth errors | Supabase → Logs → Auth | failed sign-ins, provider errors | a spike > `<x>` per hour | investigate; S2 if sign-in is broken |
| API errors | Supabase → Logs → API (PostgREST) | 5xx rate | > `<1 %>` for `<10 min>` | incident S2 |
| Edge Functions | Supabase → Edge Functions → each function → Logs | errors in `invitations`, `media-url`, `youtube-verify` (their logs never contain tokens or links) | any repeated 5xx | incident S2 |
| Storage use | Supabase → Storage → usage | total size against the plan limit | > `<80 %>` of `<plan limit>` | owner decision on the plan (RB8) |
| Backups | Supabase → Database → Backups | the latest backup is younger than 24 h | missing | incident S2 (`backup-restore.md`) |
| Security advisor | Supabase → Advisors | same baseline as at go-live | any new warning | Claude and the owner review |
| Cleanup (only once activated) | `private.storage_cleanup_audit` | runs as scheduled; `delete_failed` = 0 | any failure | `docs/cm2-cleanup-activation.md` |

Alerts go to `<alert-email>`, using the platform's own notification settings only (**Pending: owner decision** on which alerts to enable).

## 2. Routine
- **Daily (on-call, about 5 minutes):** the rows "Site up", "Backups" and "API errors". Record "ok" or an issue link in the monitoring log.
- **Weekly:** everything in the table; the security advisor; storage use against the plan.
- **After each deploy:** the signed-out checks of `tests/api/staging-checks.mjs` against production (read-only), and the CSP header present.

## 3. Monitoring log template
```text
Date: <YYYY-MM-DD>  Checked by: <role>
Site up: ok | Backups: ok (<timestamp>) | API 5xx: <rate> | Functions: ok | Storage: <x> of <limit>
Advisor: unchanged | Notes / issues: <none | links>
```

Logs, screenshots and notes must never contain tokens, invitation links, keys or personal data. Use counts and IDs only.
