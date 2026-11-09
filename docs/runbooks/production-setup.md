# Production setup runbook (CM5-1) — DRAFT

**Status: draft written before the CM5 gate. Nothing in it is authorised or has been performed.**

Gate items still open:
- legal texts R1–R5;
- AQS-owned accounts;
- paid plans;
- the domain.

The draft is finalised, reviewed and verified only after the gate, inside CM5. Every step is performed only with the owner's explicit, step-by-step approval, by the owner or by Claude with the owner (R-PROD). The developer performs none of them.

Placeholders, never real values:
- `<production-project-ref>`, `<production-db-region>`;
- `<domain>`, for example the site's host name;
- `<render-service-name>`;
- `<google-oauth-client-name>`;
- `<owner-account>`;
- `<secret-name>`.

Secrets are listed **by name only**. No value is ever written here, in Git, in tickets or in chat.

The staging setup (`docs/staging-runbook.md`) is the model. Differences for production are marked **(production)**.

## 0. Preconditions
| # | Precondition | Shown by |
| --- | --- | --- |
| P1 | Legal advice and approved texts for R1–R5 (privacy, terms, cookies, age, data processing) | **Pending: legal advice** |
| P2 | AQS-owned Supabase organisation and Render workspace, with the owner as the only owner (not a personal account) | **Pending: owner decision** |
| P3 | Paid plans chosen: Supabase `<plan>` (daily backups; PITR `<yes/no>`), Render `<plan>` | **Pending: owner decision** |
| P4 | Domain `<domain>` registered to AQS, with DNS access for the owner | **Pending: owner decision** |
| P5 | Every pull request for the first release merged into `integration`, Claude's CM4 report complete, and the staging checks passed | CM4 report; staging results file |
| P6 | Email provider decided (RB7), or the copy-link flow accepted for go-live | **Pending: owner decision** |

Stop if any precondition is not met.

## 1. Supabase project (production)
- **Action:** in the Supabase dashboard of the AQS organisation, create the project `<production-project-ref>` in region `<production-db-region>` on plan `<plan>`. The owner generates the database password and keeps it in the AQS password manager only.
- **Expected:** the project is listed and "Healthy".
- **Verification:**
  - Settings → General shows `<production-project-ref>`, the region and the plan;
  - Settings → Database shows backups enabled for the plan.
- **Rollback:** delete the empty project (nothing depends on it yet).

## 2. Database migrations
Follow `docs/runbooks/production-migrations.md` (CM5-2) step by step. Do not continue here until its final read-back passes.

## 3. Auth
1. **Google OAuth client (production):**
   - **Action:** in the AQS Google Cloud project, create the OAuth client `<google-oauth-client-name>` (Web) with the authorised redirect URI `https://<production-project-ref>.supabase.co/auth/v1/callback`. The consent screen uses the approved texts from P1. The owner signs in; the agent never handles Google credentials.
   - **Verification:** the client is listed with exactly that redirect URI.
   - **Rollback:** delete the client.
2. **Provider:**
   - **Action:** Authentication → Providers → Google: the owner enters the client ID and secret (configuration names `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`). Email sign-up stays **off** (D15).
   - **Verification:** Google shows "Enabled", and Email shows sign-up disabled.
   - **Rollback:** disable the provider.
3. **URLs:**
   - **Action:** Authentication → URL configuration: Site URL `https://<domain>`; Redirect URLs `https://<domain>/auth/callback**` only. No `localhost` in production.
   - **Verification:** the first sign-in lands on `/auth/callback` and then the page it came from.
   - **Rollback:** restore the previous values.
4. **Identity shape check:** after the owner's first sign-in, run the read-only identity check in `docs/staging-runbook.md` (section 3, step 4) against production.
   - **Expected:** `boolean`, `true`, `true`, a Gmail or `hd` match, and 0 other identities.
   - **Stop** on any other result.

## 4. Edge Functions
Deploy from the merged `integration` commit `<commit>` only.

| Function | Deploy command (performed by the owner or Claude with the owner) | Secrets and settings it needs (names only) |
| --- | --- | --- |
| `invitations` | `npx supabase functions deploy invitations --project-ref <production-project-ref>` | `SITE_URL`, `ALLOWED_ORIGINS`; `RESEND_API_KEY` and `EMAIL_FROM` only if RB7 chooses email |
| `media-url` | `npx supabase functions deploy media-url --project-ref <production-project-ref>` | `ALLOWED_ORIGINS` |
| `youtube-verify` | `npx supabase functions deploy youtube-verify --project-ref <production-project-ref>` | `ALLOWED_ORIGINS`, `AQS_YOUTUBE_CHANNEL_URL` (the `author_url` value YouTube returns for the AQS channel, as recorded in the staging test) |
| `storage-cleanup` | **Not deployed** until retention is decided (`docs/cm2-cleanup-activation.md`, Blocked) | — |

- **Action:** `npx supabase secrets set --project-ref <production-project-ref> SITE_URL=https://<domain> ALLOWED_ORIGINS=https://<domain>`. Any secret value is entered by the owner at the prompt or from the password manager, never in shell history or a file in Git.
- **Expected:** each function is listed as deployed, with "Verify JWT" **off** (they check sessions themselves; `supabase/config.toml`).
- **Verification:**
  - a request without a session is refused with 401 by `invitations`, `media-url` and `youtube-verify`;
  - `npx supabase secrets list --project-ref <production-project-ref>` lists the names (values hidden).
- **Rollback:** redeploy the previous version, or delete the function; unset the secret.

`SUPABASE_URL` and the API keys are provided to functions by Supabase. They are never set or stored by us.

## 5. Frontend on Render (production)
- **Action:**
  - In the AQS Render workspace, create the static site `<render-service-name>` from the blueprint (`render.yaml`), on the production branch `<production-branch>` (**Pending: owner decision**; it is not `feature/first-release`, which deploys staging).
  - Enter `VITE_SUPABASE_URL=https://<production-project-ref>.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>`. Both are public values.
  - The CSP header in `render.yaml` must already include the owner-approved changes (CM3-5: `font-src 'self'`).
- **Expected:** the deploy is "Live"; the default `onrender.com` URL serves the site.
- **Verification:**
  - `npm run build && npm run check:build` passed on `<commit>`;
  - the response headers are exactly those in `render.yaml` (Content-Security-Policy, X-Frame-Options and the others listed there);
  - whether to add HSTS for `<domain>` is **Pending: owner decision**, because `render.yaml` sets none today;
  - no development pages are reachable (`/dev/...` gives Not Found).
- **Rollback:** suspend the service, or roll back to the previous deploy in Render.

## 6. Domain and TLS
- **Action:** Render → the service → Custom domains → add `<domain>`. The owner creates the DNS record Render shows (`CNAME` or `A`/`ALIAS`) at the registrar.
- **Expected:** Render shows the domain verified and the certificate issued.
- **Verification:**
  - `https://<domain>` serves the site with a valid certificate;
  - `http://<domain>` redirects to HTTPS;
  - the Supabase Site URL and Redirect URL (step 3) match `<domain>` exactly.
- **Rollback:** remove the custom domain and the DNS record. The `onrender.com` URL keeps working.

## 7. First Platform Admins (owner only, F6)
- **Action:**
  - The owner signs in once.
  - In the SQL editor: `select private.grant_platform_admin((select id from auth.users where email = '<owner-account>'), '<display name>', 'Production setup');`
  - Then the second Platform Admin, through `docs/second-platform-admin.md` (P1 needs two).
- **Verification:** `select count(*) from public.platform_admins;` returns 2, and both can open `/admin`.
- **Rollback:** `private.revoke_platform_admin(...)`, as documented in the second-admin package.

## 8. Hand-over to verification
Continue with:
- CM5-7 production verification (`scripts/production-verification/`, reusing `tests/api/staging-checks.mjs`, **blocked behind the gate**);
- backups (`docs/runbooks/backup-restore.md`);
- monitoring (`docs/runbooks/monitoring.md`).

No real personal data is entered before the owner's written go-live approval.
