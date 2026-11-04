# Incident response (CM5-4) — DRAFT

**Status: draft written before the CM5 gate. Nothing in it is authorised or has been performed.** Every notification timeline and legal duty below is **Pending: legal advice**. The 48-hour figure mentioned in earlier notes is **Unverified** and is not used here. Who to notify, how and within what time is filled in only from the approved legal advice (R1–R5).

Placeholders:
- `<incident-lead>`, `<deputy>`: AQS roles;
- `<status-channel>`: an AQS-owned internal channel;
- `<regulator>`, `<notification-window>`: **Pending: legal advice**.

## 1. Severity
| Level | Meaning | Examples | First response |
| --- | --- | --- | --- |
| S1 | The service is down, or data of one organisation is exposed to another, or personal data may be exposed | site unreachable; a cross-organisation leak; a leaked key | immediately, within `<15 min>` (**Pending: owner decision**) |
| S2 | A major feature is broken or degraded, or a backup is missing | sign-in failing; uploads failing; no backup for 24 h | within `<1 h>` |
| S3 | A minor defect with a workaround | a display error | next working day |

## 2. Steps
1. **Declare:** the person who notices it opens a private incident record (not a public issue) with the time, what was seen, and severity. No personal data, tokens or links in the record.
2. **Lead:** `<incident-lead>` (or `<deputy>`) takes charge and posts in `<status-channel>`.
3. **Contain** (each action needs the owner's approval in production):
   - a suspected key leak: the owner rotates the key in Supabase or Render and redeploys the functions;
   - a cross-organisation exposure: the owner suspends the affected route or function, or rolls back the deploy (Render "Rollback");
   - a bad deploy: Render rollback to the previous live deploy;
   - a bad migration: stop and follow its rollback file (`supabase/rollbacks/`), only with the owner;
   - a data loss: follow `docs/runbooks/backup-restore.md`.
4. **Evidence:** keep the logs (Supabase, Render), the times and the actions taken. Copy only counts and IDs, never personal data.
5. **Assess personal-data impact:** which organisations, which data categories, how many people (counts). This decides step 6.
6. **Notify:** **Pending: legal advice.**
   - Whether, whom (the `<regulator>`, the affected organisations, the affected people) and within what `<notification-window>`, are filled in from the approved legal advice only.
   - Until then, the owner decides with legal counsel, case by case.
   - The developer and Claude never notify anyone externally.
7. **Recover and verify:** after the fix, rerun the read-only production checks (`tests/api/staging-checks.mjs` against production) and the affected e2e flows. Close the incident only when they pass.
8. **Review within `<5 working days>`:** cause, timeline, what worked, follow-up issues. No blame.

## 3. Contacts (placeholders only)
| Role | Contact |
| --- | --- |
| Owner | `<owner-account>` (in the AQS password manager / contact sheet) |
| Incident lead | `<incident-lead>` |
| Supabase support | through the AQS organisation's dashboard (plan `<plan>`) |
| Render support | through the AQS workspace |
| Legal counsel | **Pending: legal advice** |

## 4. Record template
```text
Incident <id>   Severity <S1|S2|S3>   Declared <time>   Lead <role>
What was seen:  <description, no personal data>
Containment:    <actions, times, approved by>
Impact:         <organisations affected (count)>, <people (count)>, <data categories>
Notification:   Pending: legal advice | <done per approved procedure: whom, when>
Recovery check: <checks run and results>
Closed:         <time>   Review: <date, link>
```
