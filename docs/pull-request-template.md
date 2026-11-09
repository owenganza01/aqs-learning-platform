<!-- AQS pull request. Target branch: integration (never feature/first-release, which deploys staging). -->
## Package
ID: <!-- e.g. CM2-1 --> · Milestone: <!-- CM2 / CM3 / CM5 -->
Decisions this follows: <!-- e.g. D20, D21, P16 -->

## What changed and why
<!-- Short. Name every file you own that changed, and every shared file (additions only). -->

## Evidence (counts, not logs; label each: Verified / Unverified, and local / sandbox / mocked / CI)
| Check | Result |
| --- | --- |
| lint, build, check:build | |
| test:unit, test:functions, check:functions | |
| test:e2e (preview, axe) | |
| test:e2e:live (mocked API) | |
| test:db (sandbox) + rollback-check | |
| Failure-path test fails on the old code | |
| Screenshots 390 px / 1440 px (synthetic data) | |

## Security and isolation
- [ ] Cross-organisation refusals tested for every new data path
- [ ] New `security definer` functions use `set search_path = ''` and check the caller
- [ ] No secrets, tokens, invitation links or personal data in code, tests, logs or screenshots
- [ ] No migration 0001–0018 edited; no `docs/decisions.md`, `ci.yml` or `render.yaml` change
- [ ] Nothing applied, deployed or configured on any hosted system

## Migrations, functions and configuration in this PR
<!-- Migration files (with rollback), Edge Functions, environment variable NAMES. Each needs owner authorisation before it reaches staging. "None" if none. -->

## Design fidelity
<!-- Which approved design this follows, or "not designed: proposal" with screenshots. -->

## Open questions and proposed decision changes
<!-- For the owner and Claude. "None" if none. -->
