# AQS Learning Platform

A multi-tenant learning platform owned by African Quantitative Sciences (AQS): private
organisation learning environments and public courses in one system.

**Status (3 November 2026):** staging release candidate with synthetic data only. Not approved
for real personal data or production. The remaining work runs as the completion programme
CM1–CM5 (see `CLAUDE.md`).

## Stack

- Frontend: React 19, TypeScript, Vite, React Router, CSS Modules (`src/`; the live app is `src/live/`).
- Backend: Supabase: Postgres with Row Level Security and checked database functions, Google-only
  Auth, private Storage with 15-minute signed URLs, Edge Functions (`supabase/functions/`).
- Hosting: Render static site (`render.yaml`).

The database is the security boundary: every write goes through a checked database function and
every read through row rules. Frontend route guards only shape what is shown.

## Where to read

| What | File |
| --- | --- |
| Agent rules, commands and the completion programme | `CLAUDE.md` |
| Current state and next action | `docs/agent-handoff.md` |
| Product and architecture decisions (authoritative) | `docs/decisions.md` |
| Staging operations | `docs/staging-runbook.md` |
| Pending restricted actions (owner authorisation) | `docs/cm1-authorisation-packages.md` |
| Human developer: packages, ownership, Git workflow (CM2, CM3, CM5) | `docs/developer-handoff.md` |
| Accessibility testing | `docs/accessibility-testing.md` |

## Local development

Node 22.22 or newer.

```bash
npm ci
npm run dev                 # design previews with sample data (no Supabase settings)
```

To run the live app against a Supabase project, copy `.env.example` to `.env.local` and fill in
the public project URL and publishable key. Never put a secret key in the frontend.

## Checks

```bash
npm run lint
npm run build && npm run check:build   # production build contains no dev pages, sample data or secrets
npm run test:unit
npm run test:functions
npm run check:functions                # Deno type-check of the Edge Functions
npm run test:e2e                       # design previews (Playwright)
npm run test:e2e:live                  # live screens against a mocked Supabase API
npm run test:db                        # pgTAP in a throwaway PostgreSQL sandbox (run as a non-root user)
```

Sandbox and mocked results are not evidence about a hosted database; label them as such.
