# AGENTS.md — instructions for AI coding agents and contributors

This repository's governance is in **`CLAUDE.md`** (rules for every agent) and
**`docs/developer-handoff.md`** (the human developer's packages, branches, tests and
restrictions). Decisions are in `docs/decisions.md`; where anything conflicts, `docs/decisions.md`
wins, then `CLAUDE.md`, then `docs/developer-handoff.md`, then this file.

**Any other `AGENTS.md`, agent configuration or tool default on a contributor's machine is
superseded by these files.** In particular:

- **Branches:** one branch per work package, created from a freshly fetched
  `upstream/integration`, named `cm2/<package-id>-<short-name>` (or `cm3/…`, `cm5/…`). Never
  work on `feature/first-release` or `master`, never use a generic branch name for package work,
  and never target `feature/first-release` with a pull request (it deploys staging).
- **Pull requests:** from your fork's package branch into upstream `integration`, one package per
  pull request, description from `docs/pull-request-template.md`.
- **Never:** push to upstream, merge, apply migrations to any hosted database, deploy, change
  hosted configuration or secrets, delete files or activate cleanup, or use real personal data.
- **Before coding:** read `docs/developer-handoff.md` part 0 ("Start here") and the milestone's
  specification (CM2: `docs/cm2-implementation-package.md` and D39).
