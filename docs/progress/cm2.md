# CM2 progress (Storage and Video) — implementation owner: human developer

Decisions: `docs/decisions.md` D39 (owner, 3 November 2026). Specification: `docs/cm2-implementation-package.md`. Released at CM2 Prompt 1. Updated once, in a final documentation-only pull request (owner, 4 November 2026); the CM2 completion report is issue #15. Status: Not started, In progress, In review, Changes requested, Merged.

| Package | Content | Starts after | Status | Pull request | Evidence summary |
| --- | --- | --- | --- | --- | --- |
| CM2-1 | Migration 0019 (video submissions, two review gates, organisation-only caption tracks, publication rule, master re-attach), pgTAP 087, rollback | — | In review | [#4](https://github.com/owenganza01/aqs-learning-platform/pull/4) | CI run 41793929359: database 1213 PASS (087 = 223), e2e 377 + 89; rollback demonstrated in a local sandbox (fingerprint and schema identical); owner decisions of 4 Nov applied |
| CM2-2 | `media-url` new kinds (audited); new `youtube-verify` (oEmbed, no credentials) | CM2-1 reviewed | In review | [#5](https://github.com/owenganza01/aqs-learning-platform/pull/5) (depends on #4) | CI run 41794076586: 1213 PASS, e2e 377 + 89; functions 32/32 local; check:functions by Claude (package H) |
| CM2-3 | Submission (resumable, `tus-js-client` with dependency review), review queue, gate 1 and gate 2 screens, master re-attach, organisation caption confirmation | CM2-1 and CM2-2 merged into `integration` | In review | [#7](https://github.com/owenganza01/aqs-learning-platform/pull/7) (depends on #5) | CI run 41794172812: 1213 PASS, e2e 377 + 110; tus-js-client 4.3.1 reviewed; screenshots docs/review-artifacts/cm2-3 |
| CM2-4 | Learner players: YouTube embed parameters and states; stored video with captions track, retry, saved position | CM2-1 and CM2-2 merged into `integration` | In review | [#8](https://github.com/owenganza01/aqs-learning-platform/pull/8) (depends on #7) | CI run 41797661385: 1213 PASS, e2e 377 + 118; staging CORS for <track>: pending owner action |
| CM2-5 | Cleanup activation runbook: documentation only. No activation, schedule or deletion; no retention periods presented as approved (package part 9a) | — | In review | [#6](https://github.com/owenganza01/aqs-learning-platform/pull/6) | CI run 41787015172 green; documentation only, Blocked status line, placeholders only |

**Deferred by the owner (D39):** retention periods and any deletion; cleanup activation.

**Acceptance at CM2 Prompt 2:** `docs/cm2-implementation-package.md` part 6 (five criteria; the cleanup criterion is deferred).

**Never done by the developer:** applying migrations, deploying Edge Functions, setting secrets or settings, hosted or channel configuration, cleanup activation, deleting files, using any YouTube account.

**Restricted actions for CM2 (owner approval each; performed by Claude or the owner):** package F (0017), the read-only pre-application check, package G (0018); package H (owner); 0019 on staging; `media-url` redeploy, `youtube-verify` deploy and `AQS_YOUTUBE_CHANNEL_URL`; staging deployment of `integration`; the owner's AQS channel URL and one Unlisted test video; switching `lookup_mode` to `advisory` only if the staging test shows the lookup is unreliable. Not in CM2: cleanup deployment, schedule or deletion.
