# CM2 progress (Storage and Video) — implementation owner: human developer

Decisions: `docs/decisions.md` D39 (owner, 3 November 2026). Specification: `docs/cm2-implementation-package.md`. Released at CM2 Prompt 1. Update this table in each pull request. Status: Not started, In progress, In review, Changes requested, Merged.

| Package | Content | Starts after | Status | Pull request | Evidence summary |
| --- | --- | --- | --- | --- | --- |
| CM2-1 | Migration 0019 (video submissions, two review gates, organisation-only caption tracks, publication rule, master re-attach), pgTAP 087, rollback | — | In review | CM2-1 pull request (FrancoDivin:cm2/CM2-1-video-review → integration) | Local: lint, build, check:build, unit 9/9, functions 10/10, e2e 377/377, e2e live 89/89; rollback demonstrated in a local sandbox (fingerprint and schema identical). CI test:db pending on the PR (expected 1,199: 087 has 209). Open: rollback-check.sh extension (decision-needed), deletable submission files |
| CM2-2 | `media-url` new kinds (audited); new `youtube-verify` (oEmbed, no credentials) | CM2-1 reviewed | Not started | | |
| CM2-3 | Submission (resumable, `tus-js-client` with dependency review), review queue, gate 1 and gate 2 screens, master re-attach, organisation caption confirmation | CM2-1 and CM2-2 merged into `integration` | Not started | | |
| CM2-4 | Learner players: YouTube embed parameters and states; stored video with captions track, retry, saved position | CM2-1 and CM2-2 merged into `integration` | Not started | | |
| CM2-5 | Cleanup activation runbook: documentation only. No activation, schedule or deletion; no retention periods presented as approved (package part 9a) | — | Not started | | |

**Deferred by the owner (D39):** retention periods and any deletion; cleanup activation.

**Acceptance at CM2 Prompt 2:** `docs/cm2-implementation-package.md` part 6 (five criteria; the cleanup criterion is deferred).

**Never done by the developer:** applying migrations, deploying Edge Functions, setting secrets or settings, hosted or channel configuration, cleanup activation, deleting files, using any YouTube account.

**Restricted actions for CM2 (owner approval each; performed by Claude or the owner):** package F (0017), the read-only pre-application check, package G (0018); package H (owner); 0019 on staging; `media-url` redeploy, `youtube-verify` deploy and `AQS_YOUTUBE_CHANNEL_URL`; staging deployment of `integration`; the owner's AQS channel URL and one Unlisted test video; switching `lookup_mode` to `advisory` only if the staging test shows the lookup is unreliable. Not in CM2: cleanup deployment, schedule or deletion.
