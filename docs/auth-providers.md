# Sign-in providers: setup and verification (D42)

The app's sign-in and sign-up pages (`/sign-in`, `/sign-up`) support Google, Apple, Facebook and
email with a password through Supabase Auth. A method appears only when it is listed in the
deployment's `VITE_AUTH_PROVIDERS` (Google is always shown). **Switch a method on only after its
provider is configured in Supabase Auth and verified**, otherwise its button cannot complete.

Everything below is owner-managed hosted configuration. None of it has been done; each step needs
the owner's authorisation (CLAUDE.md). Never paste secrets into the repository, chat or tickets.

| Method | Code (this repository) | Hosted configuration | Status |
| --- | --- | --- | --- |
| Google | Built and in use | Done earlier (staging) | Working on staging (earlier evidence) |
| Email and password | Built; tested with a mocked Supabase API | Not done | Not verified |
| Apple | Built; tested with a mocked Supabase API | Not done | Not verified |
| Facebook | Built; tested with a mocked Supabase API | Not done | Not verified |

## Shared settings (Supabase dashboard → Authentication → URL configuration)

- **Site URL:** the site's address (staging: the Render URL).
- **Redirect URLs:** `https://<site>/auth/callback**` must be listed (already needed for Google).
  Apple, Facebook and the email confirmation link all return there.

## Email and password

Supabase dashboard → Authentication → Providers → Email:

1. Enable the Email provider and allow new users to sign up.
2. **Confirm email: on** (recommended). New accounts get a link and no session until they open it.
3. Password settings: minimum length **8** (the form asks for 8); consider requiring letters and
   digits, and leaked-password protection where the plan offers it.
4. Email sending: the built-in sender is rate-limited and meant for testing. Before real users,
   set up custom SMTP (Authentication → Emails → SMTP) with an AQS sending address, and review the
   "Confirm signup" template text.

Not built: password reset ("Forgot password?"). It needs its own design and approval (D42, open).

## Apple

Needs an Apple Developer Program membership (owner).

1. In Apple Developer → Certificates, IDs & Profiles: an **App ID** with *Sign in with Apple*, then
   a **Services ID** (this is the client ID). Under the Services ID, configure *Sign in with Apple*:
   - Domains: `<project-ref>.supabase.co`
   - Return URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Create a **Sign in with Apple key** (`.p8`) and note the Key ID and Team ID.
3. Generate the client secret (a signed JWT) from the key, Key ID, Team ID and Services ID.
   **It expires after at most six months**: put a renewal date in the calendar.
4. Supabase dashboard → Authentication → Providers → Apple: enable; Client IDs = the Services ID;
   Secret key = the generated JWT.

Notes: Apple shares the person's name only on the first sign-in, and people may choose *Hide My
Email*, so the account's email can be a private relay address. Such accounts are learners only;
they cannot accept invitations (staff access needs a verified Google identity, D33).

## Facebook

Needs a Meta for Developers account (owner).

1. Create an app (use case: authenticate and request data from users with Facebook Login).
2. Facebook Login → Settings → **Valid OAuth Redirect URIs:**
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. App settings → Basic: note the **App ID** and **App Secret**; add the **Privacy Policy URL** and
   the data-deletion instructions URL. Meta requires both before the app can go live, so this waits
   for the legal pages (tasks 5-1 to 5-5).
4. Permissions: `email` and `public_profile`. Switch the app to **Live** mode.
5. Supabase dashboard → Authentication → Providers → Facebook: enable; Client ID = App ID;
   Secret = App Secret.

## Switching a method on

1. Configure the provider as above.
2. Set the environment variable on the Render service, for example
   `VITE_AUTH_PROVIDERS=google,email` (owner; it is read at build time, so redeploy).
3. Verify on the test website with a synthetic "ZZ Test" account (OD15), and record it:
   - the button opens the provider (or the email form submits) and returns to `/auth/callback`;
   - the person lands on the page they came from (`next`), signed in, as a learner with no
     organization;
   - email: the confirmation email arrives, its link signs the person in, and a wrong password shows
     "The email address or password is not right";
   - an invitation link cannot be accepted with that account (staff access stays Google-only).

## Local development

The local Supabase stack (`supabase/config.toml`) is unchanged: email sign-up is off and only Google
is configured there. To try the other methods against a local stack, the developer would enable
`[auth.email] enable_signup` (with `enable_confirmations = true`) and the `[auth.external.apple]` /
`[auth.external.facebook]` sections with secrets from environment variables, never in the file.
The automated tests use a mocked Supabase API instead (`e2e-live/live-auth-methods.spec.ts`).
