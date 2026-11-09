# AQS Learning Platform — Decision Record

*Status: **provisional**, approved 13 October 2026 (D11 added the same day). Source: design audit `AQS-design-audit.md` (repo root) and the Project document `design/design-audit-2026-10-13.md`.*

> **This file is the authoritative decision record** (`aqs-platform/docs/decisions.md`). The Claude Project document `decisions/decision-record.md` is a read-only mirror: make changes here, then refresh the mirror. Never edit the mirror directly.

Each decision says what was decided, why, and what it means for future work. "Provisional" means it can be revisited, but nobody should build against it without updating this file first.

---

## D1 — Accessibility and the orange brand colour

**Decision**
- Primary (orange) buttons use **`#C2410C` with white text** (contrast 5.18:1, passes WCAG AA).
- `#F97316` stays as a **brand accent** only, where no text sits on it or uses it (decorative lines, illustrations).
- Orange-looking text (eyebrows such as "FEATURED COURSES") uses `#C2410C`. Text links use blue `#2563EB`.
- Every interactive element has a visible keyboard focus ring. Icon-only buttons have accessible labels.

**Why:** white on `#F97316` is only 2.80:1, which fails WCAG AA for every text size.

**Phase 1 implementation notes**
- A darker **hover** colour `#9A3412` was added. The design system page shows identical default and hover colours, so no hover state was actually designed.
- Form-control outlines use `#8391A7` (3.19:1). This is slightly darker than the light grey in the designs, because WCAG 1.4.11 requires 3:1 for control boundaries.
- Focus ring: 2px white gap plus a 2px blue ring. On navy surfaces it switches to light blue `#93C5FD` (6.38:1), because blue on navy is only 2.23:1.
- All token contrast ratios are listed in `src/styles/tokens.css` and calculated live on `/design-system`.

## D2 — Archived references

**Decision:** the older **Learner Home, Course Player and Quiz** designs in `design-reference/3 Pending & Archive/Learner/` are **archived, superseded references**. Everything else in `3 Pending & Archive/` is **pending**.

- Never delete, move, rename or modify any file in `design-reference/`.
- Useful concepts to revisit from the archived screens: organization badge in the header, "Assigned to you" with required courses and due dates (see D7), "Message your instructor" link in the player, and "Save and exit" on quizzes (deferred, see D7).

## D3 — Landing page hero

**Recommendation: Option A** (`Landing [Ready].png`, frame 1). **Owner decision (23 October 2026): Option A is confirmed.** Phase 2 may close with the existing labelled hero-photo placeholder (`Hero image placeholder`). No substitute image is authorised, and sourcing the photo as a standalone asset is deferred. Limitation: the Option A photo is embedded in the reference board, not exported as its own file. This entry originally read "Awaiting your confirmation before the landing page is built." The landing page was built (commit `75bd024`) before this confirmation was recorded here.

- In A, the person faces into the page, towards the headline and the buttons, and the laptop is fully in frame.
- In B, she faces out of the page and the laptop is cut off at the right edge.
- The two frames are otherwise identical. The source image must not be modified. The hero photo will need exporting from Figma as its own asset.

## D4 — Organization security and administration

These rules are **documented for future backend work. No backend security exists yet.**

- Verifying an email domain must **never** automatically grant organization membership.
- Domain-based admission must be **explicitly enabled** by an authorized administrator and follow the approved membership process. The General Admin "Invitations and domains" design (DNS-verified, opt-in, joins as Learner only) is the reference pattern.
- Organizations are created in **Draft**. Lifecycle: **Draft → Active → Suspended**.
- **Global Admins assign General Admins.** General Admins manage their organization's invitations and memberships.
- A user can hold **multiple roles** and belong to **multiple organizations**.
- Organization-scoped permissions are kept **separate** from platform-wide Global Admin permissions.
- These rules replace the conflicting copy in the "Create organization" and "Organizations" designs ("Users with this email domain join automatically", status defaulting to Active, assigning "Initial instructors"), and the single-role "Users and roles" design.

## D5 — Video hosting

- In the current phases, build **only the video-player presentation** with clearly labelled mock data.
- Do not implement real video hosting, and never present unlisted YouTube links as secure private content.
- Before production: recommend a hosting approach with access controls suitable for private organization content (for example signed, expiring playback URLs).

## D6 — Invitations

- For the MVP, organization invitations are managed by **General Admins**.
- Instructor-sent invitations (the "Invite learners" card and "Invitations" page in the instructor designs) are **out of scope** unless approved later.

## D7 — MVP scope

| Feature | Status |
|---|---|
| Offline downloads, background sync | **Deferred.** Offline/syncing banners may appear only as labelled **mock states**. Never claim offline capability. |
| Required courses and due dates | **In the MVP if feasible**, because org admins need to track overdue training. |
| Learner notes (mobile player "Notes" tab) | **Deferred.** |
| Course ratings (★ 4.8 on course cards) | **Deferred.** |
| Quiz "Save and exit" | **Deferred.** |

Deferred features must not be built as working functionality by accident. If a design shows them, leave them out or show them clearly as "coming later".

## D8 — Sign-up

- Public Google sign-up may create a **public learner account**.
- **Organization membership is a separate process** (invitation or approved admission).
- An organization entry link must never bypass authorization or membership checks.
- **Note (23 October 2026):** C7 (the "Not linked" screen, and whether public sign-up is always open) remains open. The owner has deferred the screen: whether it exists and where its entry point belongs are still to be decided. No Not linked screen is implemented. This note does not change the rules above.

## D9 — Responsive targets

- **Public and learner screens:** desktop and mobile.
- **Instructor and administrator screens:** desktop-first, but usable on tablets and smaller viewports.
- Do not call a screen "fully responsive" until it has been tested at those sizes.

Phase 1 layouts: PublicLayout switches to a menu button below 1024px. AppShell's sidebar becomes a slide-in drawer below 1024px. AuthLayout hides the navy panel below 900px. FocusLayout compacts its header below 768px. The preview page was tested at 390, 768, 1024, 1280 and 1440px wide with no sideways scrolling.

## D10 — Dependencies

- **React Router** for navigation: `react-router` **8.4.0 is declared in `package.json` and locked in `package-lock.json`, but not yet installed in the Windows development environment** (status as of 13 October 2026; run `npm install`). It requires Node.js **22.22 or newer**.
- **CSS Modules + CSS custom properties** for styling. No CSS framework.
- Keep the existing React + TypeScript + Vite project.
- No backend, database, authentication provider or UI framework in this phase.
- Inter is loaded from Google Fonts in `index.html` (no extra package). Self-hosting is an easy swap later if needed for privacy or offline development.

## D11 — Defer authentication; build the UI against replaceable interfaces

*Approved 13 October 2026.*

**Decision**
- Build in stages: design system → public pages → learner → instructor → admin workspaces, **before** real authentication.
- During UI work, use **clearly labelled mock users and mock data**, available in local development only.
- Keep routing, authentication and authorization behind **replaceable interfaces**, so a real auth provider and backend can be plugged in later without rewriting screens.
- **No** fake login security, **no** stored passwords, and no claim that mock role selection protects routes or data. Mock access must never become a production mechanism.
- Keep the agreed model: **user identity**, **organization membership** and **permissions** are separate concepts (see D4).
- **Do not build authentication pages or functionality** until explicitly instructed. The existing `AuthLayout` shell stays as an unused layout.

**Proposed architecture: PROVISIONAL, not approved (see A1–A6 below)**

| Layer | What screens use | Development implementation | Later replacement |
|---|---|---|---|
| Session | `useSession()` returns `{ status, user, memberships, platformRoles }` | Dev-only mock provider with a visibly labelled persona switcher | Real provider: Google sign-in + backend session |
| Permissions | `can(permission, scope)`, e.g. `can('course.edit', { orgId })` | Computed from the mock persona's memberships | The same function, fed by the backend's answer; **the server re-checks every request** |
| Data | Async service functions, e.g. `courses.listForOrg(orgId)` | Mock services returning promises, with fake delays and errors | HTTP client calling the real API |
| Routes | Workspace-scoped URLs, plus guard components for user experience only | Guards read the mock session | Same guards; real enforcement on the server |

**Rules to keep integration easy**
1. Screens never import mock data files directly. They only call services and hooks.
2. Screens never check role names (`role === 'admin'`). They check permissions via `can()`.
3. A user has many memberships; every org-scoped entity carries an `orgId`. IDs are opaque strings, never names or email domains.
4. All data access is asynchronous, so every screen gets real loading, empty, error and permission-denied states from the start.
5. The mock session lives only in development builds, excluded the same way as `/design-system`. A production build with no real provider shows everyone as signed out.
6. Nothing role-related is stored in `localStorage` as a source of truth. A remembered mock persona is a development convenience only.
7. Route guards are labelled "UX only". Security is enforced on the server and database (D4, project instructions §6).

**Open decisions to settle before Phase 2 routing (A1–A6)**

> **Status of A1–A6: PROVISIONAL, not approved.** These are recommendations only. Do not build against them until each is explicitly approved and this note is updated.
- **A1 — Workspace URLs.** Recommended: org-scoped areas carry the organization in the URL (e.g. `/o/:orgSlug/...`), public learning lives at top-level paths, and Global Admin at `/admin/...`. The URL selects a workspace; it never grants access.
- **A2 — Permission vocabulary.** Recommended: a fixed list of permission strings (e.g. `org.members.manage`, `course.edit`, `course.publish`) mapped from roles in one place.
- **A3 — Identity provider.** Google sign-in only (D8), through the provider chosen for the stack (earlier stated: Firebase Authentication). Identity only; roles and memberships live in Postgres and are checked by the backend.
- **A4 — Data-fetching approach.** Recommended: plain async service functions now; a caching library (e.g. TanStack Query) only when the real API arrives, and only if justified.
- **A5 — Mock persona set.** Recommended: Public learner; Org learner (one org); Learner in two orgs; Course Creator; General Admin who is also a Course Creator; Global Admin; plus a "signed out" state.
- **A6 — Development mode switch.** Recommended: mocks are enabled only by `import.meta.env.DEV` (no environment variable that could be switched on in production).

---

## Provisional choices made during Phase 1

These are small design-system choices that the designs left open. Change them here if you disagree.

1. **One warning colour.** The designs use two different offline-banner colours (`#FFF7ED` on the dashboard, `#FEF3C7` in the player). All warnings use `#FFF7ED` with `#9A3412` text.
2. **Two added button variants:** *Neutral* (grey outline, navy text, as used by "Previous", "Cancel", "Try again") and *Danger* (for "Revoke", "Deactivate").
3. **Eyebrow text style** (12px, semibold, uppercase, letter-spaced) added to the type scale. It's used throughout the designs but missing from the design system page.
4. **Status colours** (success, warning, danger, violet) added as tokens. They're used in screens but missing from the design system page.
5. **Wordmark** is text-only ("AQS / E-LEARNING") because no logo file exists yet.
6. **Footer contact details** are left blank until AQS confirms real ones. The design shows placeholders.
7. The **`/design-system` preview is development-only.** It is excluded from production builds.

---

# Decisions recorded after 13 October 2026

Entries above this line are unchanged and keep their original wording, IDs and dates. Entries below use these status labels:

- **Confirmed in conversation** — agreed by the project owner in conversation on the date shown; this file records it.
- **Proposed** — a recommendation awaiting the project owner's approval. Do not build against it until its status is updated.
- **Open** — an unresolved question. No default has been chosen.

Entries below use the role terms proposed in D22 (Platform Admin, Organization Admin, Instructor, Learner).

## D12 — Implementation foundation, working copy and preservation

**Confirmed in conversation (19 October 2026)**
- The implementation working copy is `C:\Dev\aqs-platform`, on branch `phase-1-foundations` at commit `1ee920d`. It is outside OneDrive.
- Normal development is permitted in that working copy, within the other decisions in this file.
- The earlier folder `OneDrive\Desktop\AQS-New-Platform\aqs-platform` is preserved untouched and is not used for implementation.
- Project B (`owenganza01/aqs-landing-page-planning`, last audited at commit `38c4358`) is a **read-only reference**. It is not merged wholesale, and the recovery repository is never modified.
- The v0 chat connected to that repository stays **connected but unused** while auditing and planning continue, because any v0 edit creates commits in the recovery repository.
- The following remain preserved, unmodified and never moved, renamed or deleted: the original Figma designs; everything in `design-reference/`, including `new designs/`; all design ZIPs; `backups/`; the OneDrive folder; the recovery repository; and the untracked files `AQS-design-audit.md` and `decision-record.md` in both the OneDrive folder and the working copy. This preservation rule covers only the items listed. It does not restrict normal development of the project's tracked files in the working copy.

**Verified on 19 October 2026 (read-only)**
- `C:\Dev\aqs-platform`: branch `phase-1-foundations`, `HEAD` = `1ee920dd12df5399a405afefce2a8cf78b26c825` (same as GitHub). All 66 committed files match `1ee920d`. No tracked changes. Two untracked files (`AQS-design-audit.md`, `decision-record.md`), byte-identical to the copies in the OneDrive folder.
- OneDrive folder: branch `master` at `524c7d4`, unchanged since 13 October 2026.

**Proposed (19 October 2026)**
- Project A's approved Phase 1 foundation (design tokens, components, layouts and responsive behaviour at `1ee920d`) is the definitive implementation foundation.
- Project B may be used as a reference for its screen inventory, domain types, service contracts, mock-data shapes and useful copy, after correction against these decisions.

**Why:** Project A is the only codebase that implements D1, the measured type scale, focus states and tested responsive layouts. The 19 October 2026 audit found that Project B regresses D1 and conflicts with D4, D6, D8 and D10.

## D13 — Framework reaffirmed; hosting, backend, database and authentication deferred

**Confirmed in conversation (19 October 2026)**
- D10 stays in force: React, TypeScript, Vite, React Router, CSS Modules and CSS custom properties.
- Next.js, Tailwind, shadcn or any other framework may be introduced only with a separate, explicitly recorded approval.
- No hosting platform, backend, database or authentication provider is selected.
- A separate comparison will be prepared. It considers **Render first** and evaluates alternatives on: free tiers and their limits, total stack cost, limits and costs beyond free tiers, fit with D15–D21, tenant isolation and maintenance burden.
- Preparing a Render-first comparison does **not** select Render or any other provider. Hosting, backend, database and authentication-provider decisions remain open until separately approved and recorded.

**Proposed (19 October 2026)**
- The provisional approval given in conversation on 18 October 2026 to a Next.js, Neon and Better Auth stack ("Proposal A") is withdrawn. That approval was never recorded in this file.

**Open**
- The hosting platform, backend, database and authentication provider.
- Technologies discussed earlier but never recorded as decisions remain candidates only: PostgreSQL, Firebase Authentication, Render hosting, Node.js + Express, Drizzle ORM and Resend (stated in a 12 October 2026 conversation outside this Project, available only as a summary); Neon and Better Auth (18 October 2026). None is selected.

**Consequences:** a Vite single-page app has no server of its own, so the backend will be a separate API service or a hosted backend platform. This is a fact for the comparison, not a choice.

**Note (verified 19 October 2026):** `react-router` 8.4.0 is installed in the local development environment. D10's note of 13 October that it was not yet installed is out of date. D10's text is left unchanged.

## D14 — Design scope and asset handling

**Confirmed in conversation (18 October 2026) — design scope**
- Use the updated designs in `design-reference/new designs/` only for screens whose content changed: Landing; Authentication (updated sign-in and the new Google sign-up frame); Learner dashboard; and the minor changes to Admin › Organization detail and Admin › Users and roles.
- Keep the earlier designs for unchanged screens, including the Admin board, Course player, Instructor screens, Learner courses & quizzes, and all pending and archived screens. D2's classification is unchanged.
- Preserve every original design and recovery copy.

**Confirmed in conversation (19 October 2026) — measurement references**
- Verified, content-identical 2× exports may be used as measurement references for **unchanged screens only**. On 18 October 2026, the 2× exports of the Admin board, Course player, Instructor screens and Learner courses & quizzes differed from the originals by less than 0.5% of pixels. The original exports remain the primary reference and are preserved.

**Proposed (19 October 2026)**
- Build page structures against the relevant design reference first. Track missing assets in a list and use clearly labelled placeholders.
- Do not finalize or replace the landing page's original Figma assets yet. After all page structures exist, source the correct original assets and review visual fidelity.

**Open**
- The landing hero choice. **D3 is no longer open for Phase 2:** the owner confirmed Option A on 23 October 2026 and accepted the labelled placeholder (see D3). The hero asset is deferred. The 19 October sourcing sequence under "Proposed" above is not an approved requirement and is not changed by this note.

## D15 — Authentication and invitation policy

**Status (owner-approved 23 October 2026):** Google-only is the current public-learner authentication requirement. Email and password remains an earlier, unapproved proposal in this entry. This status does not select an identity provider and does not approve real authentication. A3 remains provisional, and its text is unchanged.

**Date conflict (unresolved, 23 October 2026):** the "Owner confirmations — 22 October 2026" block also records Google-only as the current requirement. The record does not establish which date is the approval date, so this entry does not choose between 22 and 23 October. The conflict remains open for owner resolution.

**Proposed policy (19 October 2026) — amends D8; conflicts with provisional A3**
- Public Learners may sign in with email and password, or with Google.
- One authentication system serves everyone. Staff access is granted through a separate invitation and onboarding workflow, not a separate sign-in system.
- Staff access requires a valid invitation naming the intended role and organization.
- An existing account holder signs in to that account and may accept an invitation only when the account email matches the invited email.
- A new invitee completes the invitation and account-activation flow, including email verification, before receiving the invited access.

**Confirmed in conversation (19 October 2026) — what is authorized now. This is the explicit instruction D11 requires, limited as follows**
- Non-functional page layouts may be prepared **only** for the existing approved Google-only authentication designs: sign-in, sign-in error, mobile sign-in and Google sign-up (`design-reference/new designs/2 Screens/Auth [Ready].png`).
- **No authentication behaviour is authorized**, including password handling of any kind, sessions, tokens, provider integration and route protection.
- Email/password sign-in, password-reset, email-verification and invitation-activation layouts require **separate design approval** before any layout work.
- Real authentication requires its own separate authorization and a provider decision (D13).
- D11's "no stored passwords" is read as: no password storage in mock development, and never plaintext password storage anywhere in the application.

**Open**
- Designs for email/password sign-in, password reset, email verification and invitation activation.
- The pending "Accept invitation" and "Not linked" designs (`3 Pending & Archive/Auth/`) are not covered by the layout authorization above.
- **Not linked (23 October 2026):** the design exists (`3 Pending & Archive/Auth/Not linked/Desktop.png`), but its implementation is deferred pending the C7 owner decision (D8). No Not linked screen or route is built.
- **Accept invitation (23 October 2026):** the design exists (`3 Pending & Archive/Auth/Accept invitation/Desktop.png`), but its implementation is deferred under D18.

**Confirmed in conversation (23 October 2026) - Google-only authentication implementation (clarifies D11 and D15; limited scope)**
- This authorization supersedes the prohibition in the 19 October 2026 block above ("No authentication behaviour is authorized") and D11's instruction not to build authentication functionality until explicitly instructed. It applies only to the Google-only authentication scope below. The earlier wording is retained unchanged as the historical record.
- Authorized scope: the official Supabase JavaScript client; Google OAuth through Supabase Auth as the only sign-in provider; OAuth callback and session handling; sign-in and sign-out; and frontend route protection for authenticated routes.
- Still disabled, and not authorized to be enabled: email and password sign-in, magic links, email OTP, phone sign-in, anonymous sign-in and manual account linking. Password signup must not be implemented.
- Not authorized by this entry: database migrations or changes; role, organization membership or invitation logic; account provisioning beyond Supabase's existing sign-in behaviour; hosting changes (D13); Google Cloud settings or credential changes; and any other product feature. A Google sign-in alone must never grant an administrator or organization role.
- Frontend route protection is a user-experience control only. Enforcement of data access and authorization remains with Supabase policies and server-side logic (D21).
- Unchanged: D11's requirements to keep routing, authentication and authorization behind replaceable interfaces, to avoid stored passwords, and to label mock users as development-only. The 22/23 October date conflict in D15 remains open; this entry does not resolve it. Not linked and Accept invitation remain deferred as recorded above.

## D16 — Course ownership and sharing

**Confirmed in conversation (18 October 2026)**
- Courses may be platform-owned or organization-owned.
- Sharing a course with another organization requires explicit permission.

**Open:** who grants and who receives sharing permission; whether sharing can be withdrawn, and what Learners keep if it is.

## D17 — Administrative scope

**Confirmed in conversation (18 October 2026)**
- Organization Admins are restricted to their own organization.
- Platform Admins manage the platform globally but cannot impersonate users.

**Confirmed in conversation (19 October 2026)**
- Platform-wide administration does not automatically grant access to private learner content.

**Open:** which learner information, if any, Platform Admins may see (for example aggregate figures), and how any exceptional access would be granted and recorded.

## D18 — Staff invitations

*Relates to D4 and D6; their text is unchanged.*

**Confirmed in conversation (18 October 2026)**
- Organization Admins may invite Instructors for their own organization.
- Only Platform Admins may invite Organization Admins.
- Invitations expire after seven days.
- Acceptance and email verification are required. No further approval is needed once an authorized invitation is accepted and verified.

**Confirmed in conversation (19 October 2026)**
- Staff invitations must be revocable by authorized administrators.

**Confirmed in conversation (23 October 2026) — D18-A: invitation revocation**
- Organization Admins may revoke pending Instructor and Learner invitations within their own organization.
- Only Platform Admins may revoke pending Organization Admin invitations.
- Platform Admins may revoke pending invitations across organizations.
- Instructors and Learners cannot revoke invitations.
- Permissions are enforced on the server and in the database, not only in the user interface.
- This replaces the provisional demo rule for `org.invitations.revoke` in D27 for production. The demo rule is unchanged for the development build.

**Confirmed in conversation (23 October 2026) — D18-B: Platform Admin provisioning**
- No public Platform Admin registration, no self-promotion, and no elevation to Platform Admin through an ordinary organization invitation.
- The initial Platform Admin is established through a documented, owner-controlled procedure.
- Later Platform Admin appointments are authorised by an existing Platform Admin, or are made through the owner-controlled procedure.
- Each appointment records who performed it, who was affected, when it occurred, and the reason.

**Open**
- ~~Which administrators may revoke which invitations.~~ **Resolved 23 October 2026** (D18-A above).
- ~~Platform Admin provisioning.~~ **Resolved 23 October 2026** (D18-B above). The owner-controlled procedure for the initial Platform Admin is still to be written down; this entry does not define its steps.
- ~~Whether a revoked or expired invitation can be reissued.~~ **Resolved by the owner's 22 October 2026 confirmation** (see "Owner confirmations — 22 October 2026"): reissue only through a new invitation with a new token; revoked or expired tokens remain invalid.

**Deferral (owner decision, 23 October 2026)**
- The Accept invitation screen (`design-reference/3 Pending & Archive/Auth/Accept invitation/Desktop.png`) is designed, but its implementation is deferred. Implementation waits for the email-matching mechanism (technical review, per the 22 October 2026 confirmation) and for the backend. This deferral authorises no acceptance behaviour, token handling or invitation state change.

## D19 — Quizzes

**Confirmed in conversation (18 October 2026)**
- The passing score defaults to 70%.
- Attempt limits are configurable per quiz. Retakes are allowed while attempts remain.
- Grading happens on the server.
- Historical attempts are retained.
- Duplicate submissions are handled idempotently.

**Open:** which attempt counts (for example highest, latest or first pass); the default attempt limit; whether the passing score can be changed per quiz; how historical attempts are treated when a quiz is edited.

## D20 — Protected resources

**Confirmed in conversation (18 October 2026)**
- Protected resources are available only to enrolled Learners or Learners with an explicit access grant.
- Public previews require separate, explicit approval.
- Signed URLs expire after 15 minutes.
- Downloads require both an authorization check and a downloadable flag on the resource.

**Open:** the scope of an access grant (resource, lesson or course); the video playback approach within the 15-minute limit (to be covered by the D13 comparison).

## D21 — Security and architecture baseline

**Existing requirements (restated here; not new decisions)**
- Project instructions §6 (Multi-Tenant Security): "Enforce authorization on the server and, where applicable, at the database level. Do not rely on frontend filtering, hidden navigation items, URLs, organization slugs, or email domains as security controls." Also: "Use explicit organization membership and scoped permissions."
- Project instructions §9 (Engineering Approach): "Prefer a modular architecture with clear boundaries. Avoid unnecessary microservices and premature complexity."
- D11 (approved 13 October 2026), **Decision** section: build the UI in stages before real authentication; use clearly labelled mock users and mock data in local development only; keep routing, authentication and authorization behind replaceable interfaces. D11's architecture table and A1–A6 remain provisional, as recorded in D11.

**Proposed (19 October 2026)**
- Roles and memberships used for authorization come only from trusted server-side data, never from client-supplied values (consistent with project instructions §6).
- Known Project B issues are not carried forward: fake partner endorsements; the "Northstar Learning" metadata; `typescript.ignoreBuildErrors`; production analytics without an approved privacy decision.

## D22 — Canonical role terminology

**Proposed (19 October 2026)**

New decisions use **Platform Admin**, **Organization Admin**, **Instructor** and **Learner**. Older entries keep their original wording. No code, permission names or interface labels are renamed as part of this documentation change.

| Canonical term | Earlier labels |
|---|---|
| Platform Admin | Global Admin |
| Organization Admin | General Admin |
| Instructor | Course Creator (project instructions); "Instructor" (designs) |
| Learner | Student/Learner; Public Learner |

**Open:** whether "Public Learner" is a Learner without organization membership or a separate role; whether the AQS Owner role (project instructions §4) is a separate role or a Platform Admin capability.

## D23 — Decision-record housekeeping

**Proposed (19 October 2026)**
- The authoritative record is `aqs-platform/docs/decisions.md` in the implementation working copy (D12). The Claude Project document `decisions/decision-record.md` is a secondary, read-only mirror, updated only after this file is approved and written.
- The root file `aqs-platform/decision-record.md` is **non-authoritative and stale**: it contains D1–D10 only and is untracked by Git. Identical copies exist in the working copy and the OneDrive folder. It is neither deleted nor archived.
- On 19 October 2026, no file in either folder (excluding `node_modules`, `dist` and `.git`) referred to it. The only match for "decision-record" is this file's reference to the Project mirror. Its eventual disposition will be proposed separately.
- On 19 October 2026, the Project mirror's decision content matched this file at `1ee920d` line for line. The only differences were the mirror's own title and its read-only notice.

## D24 — Unavailable navigation destinations

**Confirmed in conversation (20 October 2026)**
- Public navigation destinations that are not built yet are shown as **unavailable**, never as working links. This covers Sign in, Get started, About, Contact, and the unfinished footer destinations (Our Story, Instructors, Careers, Blog, Privacy Policy, Terms and Cookie Policy). They must not lead to a missing page or the Not Found page.
- Unavailable items are displayed as dimmed text and include a visually hidden "(not available yet)" label that is exposed to screen readers. Because these items are not interactive links or buttons, they are not included in the keyboard tab order.
- The footer **Courses** and **For Organizations** links go to the corresponding sections of the landing page (`/#courses` and `/#for-organizations`) until dedicated pages exist.
- **Open (23 October 2026, not decided):** the landing page no longer has an organizations section after the single-page change (see D3). The For Organizations links currently scroll to the top of the landing page, because `#for-organizations` is the id of the hero section. The intended destination is an owner decision. This note approves no destination, adds no production route and does not change the link behaviour.
- **Sign in** and **Get started** stay unavailable until sign-in is separately approved. This entry does not approve or implement authentication. D11, D13 and D15 still apply.

**Why:** unbuilt features must not appear to work (D7), public screens must work on mobile and desktop (D9), and authentication work is limited to the approved layouts (D11, D15).

**Implemented in:** commit `09139a4` on `phase-1-foundations` (public header and footer, and the About and Contact items on the landing and course-detail pages).

## D25 — Hosting and backend stack

*ID reserved in D27 for the 21 October 2026 stack approval. Recorded 26 October 2026.*

**Confirmed in conversation (21 October 2026)**
- Supabase (PostgreSQL, Row Level Security, Auth and Storage) with Render hosting is the selected architecture. The owner recorded it as final in "Owner confirmations — 22 October 2026".
- Hosting outside Rwanda is a final decision and is not reopened. The legal and privacy gates (R1–R5 in the architecture plan) still apply before any real personal data.
- D13's earlier wording is unchanged.

## D26 — Sign-in for the first release

*ID reserved in D27 for the 21 October 2026 sign-in approval. Recorded 26 October 2026.*

**Confirmed in conversation (21 October 2026)**
- Sign-in is Google-only for the first release. Email and password, magic links, phone and anonymous sign-in stay disabled.
- Source: the owner approval recorded at the top of the architecture plan, Revision 2 (21 October 2026). D15's text and its unresolved 22/23 October date conflict are unchanged; this entry does not resolve which later date is the approval date.

## D27 — Development-only demo layer (A1, A2, A4, A5, A6)

*D25 and D26 are reserved for the 21 October 2026 stack and sign-in approvals, recorded separately. The original A1–A6 text in D11 is unchanged and keeps its provisional wording. This entry approves only the development-build demo architecture described below. It does not resolve production decisions or every provisional statement in A1–A6.*

**Confirmed in conversation (21 October 2026): scope**
- **Friday 23 October demo:** a local development-build demo on the owner's PC. No hosted or deployed demo build. If a hosted URL turns out to be required, stop and ask before changing A6.
- **Production is unchanged by this entry.** Production builds keep only `/` and the Not Found page. A route existing in the demo does not approve it for production.
- **Mock sign-in screens (approved 23 October 2026; development build only).** `/sign-in`, `/sign-in/error` and `/sign-up` show the approved Google-only layouts with inert controls. "Continue with Google", "Sign up with Google" and "Try again" are inert. Contact support and the footer links stay unavailable under D24. The screens make no provider or API call, create no session, token or storage write, and grant no access. A visible demo-only notice appears on all three routes. Production is unchanged.
- **Exception to the inert "Try again" rule (approved 23 October 2026).** `/sign-in/error` has a "Back to sign in" link to `/sign-in`. "Try again" remains inert. The link makes no provider, API, session, token or storage call.
- **Request a demo (authorised 23 October 2026; development build only).** `/request-demo` shows a visual-only request-a-demo form based on the request-a-demo frame of `design-reference/2 Screens/Admin [Pending backend].png` (identified in the archived audit as frame 3). The submit control is disabled and labelled "not available yet". The route sends no request, stores no data, creates no organization and grants no access. It is gated by `import.meta.env.DEV`. No navigation entry point is authorised by this entry. Production exposes only `/` and the Not Found page. This does not change the classification of the Admin board (D2, D14).
- **Demo behaviour is not security.** Persona switching, permission checks in the interface and route guards are user-experience only. They are not authentication or authorization. The database is the security boundary. No real authentication is implemented for the demo.

**Confirmed in conversation (21 October 2026): demo architecture**
- **A4:** async service functions, with development-only sample data kept outside page components. No data-fetching library.
- **A6 (unchanged):** sample users and data are enabled only by `import.meta.env.DEV`. No environment-variable override, hosted demo build or production sample-data mode. Production output must not contain usable personas, sample data or development routes.
- **A2:** one central permission file, `can(permission, scope)`. Pages never check role names. Public browsing of public course outlines does not require a profile. Signed-in permission checks require an active profile. Organization-specific access and actions require the applicable permission in the list below and the organization state under F4: an active organization for learners, a draft or active one for staff. The only exception is `learning.own_records.view`, which lets a learner read their own existing records from a suspended organization and grants no organization access.
- **A1:** URLs, organization slugs, course IDs and organization IDs identify resources and never grant access. Checks use the organization recorded on the resource itself, so pairing a resource with another organization's URL shows "no access".
- **Suspended organizations, general rule (F4):** a suspended organization grants no organization access to any role: no courses, lesson content or quizzes, no new activity (enrolments, progress or attempts), no memberships and no other members' records.
- **Suspended organizations, exception:** a learner keeps **read-only** access to **their own existing** records (enrolments, progress and attempts) from that organization, through `learning.own_records.view` only. The exception grants no access to that organization's courses, lesson content or quizzes, no new activity, and no other members' records.

**Confirmed in conversation (21 October 2026): demo route map (development build only)**

| Area | Routes |
|---|---|
| Public | `/` (landing and navigation unchanged, D24); `/courses/:courseId`; `/request-demo` (development build only; see the 23 October 2026 entry above the table) |
| Auth (mock screens; development build only) | `/sign-in`; `/sign-in/error`; `/sign-up` |
| Learner (personal; eligible courses from every organization) | `/learn`; `/learn/courses/:courseId/lessons/:lessonId`; `/learn/courses/:courseId/quizzes/:quizId`; `/learn/courses/:courseId/complete` |
| Instructor | `/o/:orgSlug/teach`; `/o/:orgSlug/teach/courses/:courseId`; `/o/:orgSlug/teach/courses/:courseId/quizzes/:quizId` |
| Organization Admin | `/o/:orgSlug/manage`; `/o/:orgSlug/manage/members`; `/o/:orgSlug/manage/invitations`; `/o/:orgSlug/manage/settings` |
| Platform Admin | `/admin/organizations`; `/admin/organizations/:orgId` |
| Development | `/design-system` |

`/dev/learner-dashboard` and `/dev/course-detail` are replaced by `/learn` and `/courses/:courseId`.

**Confirmed in conversation (21 October 2026): demo permission list**

| Permission | Granted to (demo rule) |
|---|---|
| `learning.own_records.view` | Any signed-in user: own existing enrolments, progress and attempts, read-only. Includes records from a suspended organization under the exception above. |
| `course.content.view` | Active enrolment in a published course; for organization courses, also an active membership in an active organization |
| `quiz.attempt.submit` | A separate permission: requires `course.content.view` and attempts remaining; shows score and pass/fail only |
| `teach.workspace.view` | `instructor` in that organization |
| `course.edit` | **Provisional demo rule, not a Q5 decision:** on that course's staff, draft courses only |
| `manage.workspace.view` | `org_admin` of that organization |
| `org.members.view` | `org_admin` |
| `org.members.manage_roles` | `org_admin`; `instructor` and `learner` roles only, never `org_admin` (F3); never removes the last org admin |
| `org.invitations.view` | `org_admin`, own organization |
| `org.invitations.create` | `org_admin`; Instructor and Learner invitations only (D6, D18) |
| `org.invitations.revoke` | **Demo rule, pending the Priority 4 review of migration 0004 (development build only).** `org_admin`; Instructor and Learner invitations in their own organization. The production revocation rule is D18-A (confirmed 23 October 2026), and this demo row does not change it. |
| `org.learning_records.view` | `org_admin`; organization members only, never public learners |
| `org.settings.view` | `org_admin`; view only |
| `platform.organizations.view` | Platform Admin |
| `platform.organizations.set_status` | Platform Admin |
| `platform.org_admin_access.view` | Platform Admin: an organization's org admins, its pending org-admin invitations and invitations they sent. No user list, support search or learning records (D17, L11) |
| `platform.org_admin_invitations.manage` | Platform Admin: create org-admin invitations (D18, F3). Revoking them is a **provisional demo rule**, pending the same Priority 4 review. |

Shown as unavailable in the demo, not granted: publishing and publication approval, editing settings, support search, inviting from an Instructor account, and creating organizations (on hold under D4).

**Confirmed in conversation (21 October 2026): A5 personas**
- Fictional names and `@example.com` addresses only; organizations "Sample Org A", "Sample Org B" and "Sample Org C (suspended)". Real people's names are not used. The persona switcher and every sample view are labelled as demo or sample data.
- Signed out; Alex Sample (learner, no organization); Bea Sample (learner, Org A); Chris Sample (learner, Org A and Org B); Dana Sample (instructor, Org A); Eli Sample (org admin and instructor, Org A); Fran Sample (Platform Admin); Gabi Sample (signed in, pending Learner invitation to Org A); Hugo Sample (learner, Org C suspended: own existing records read-only, nothing else from Org C).

**Provisional or open**
- Instructor editing scope (Q5): the demo rule above is not a final decision.
- Invitation revocation (demo only): the demo rule above remains provisional, pending the Priority 4 review of migration 0004. The production revocation rule is D18-A (confirmed 23 October 2026), not this demo rule.
- The publishing workflow (organization-admin approval, L2) is not shown in the demo.
- Which organization settings can be edited.
- The L11 wording, to be recorded with Priority 4.
- An Instructor persona for AQS-owned courses: excluded until it is decided who authors platform-owned courses.
- Not designed: suspended-organization, no-access and workspace-switching screens; certificates on course completion. Invitation acceptance is designed (`design-reference/3 Pending & Archive/Auth/Accept invitation/Desktop.png`), but its implementation is deferred (see D18, 23 October 2026).
- *Clarification (23 October 2026): the completion route `/learn/courses/:courseId/complete` and the Congratulations layout are provisionally approved for frontend implementation, excluding certificate features, under D30. Certificates on course completion remain not designed and deferred under D30.*
- A3's correction is deferred to the update recording the 21 October approvals.

## D28 — Phase 1: Foundations Acceptance Criteria

**Status:** Approved
**Approved:** 22 October 2026
**Scope:** Frontend foundations only

**Decision**

Phase 1 — Foundations will be accepted against the following criteria. Existing implementation must be inspected before changes are proposed; components or layouts that already satisfy the criteria must not be rebuilt unnecessarily.

1. Design tokens and global styles
   * Establish and verify reusable design tokens and global styles for colors, typography, spacing, borders, radii, shadows, and focus states.
   * Use the approved AQS design-system reference as the source of truth for visual decisions.
2. Reusable design-system components
   * Verify or implement the following reusable components as appropriate: `Button`, `FormField`, `Card`, `Badge`, `Avatar`, `ProgressBar`, `Skeleton`, `EmptyState`, `Banner`, `Table`, `Tabs`, and `Icon`.
   * Components must have clear, consistent interfaces and appropriate semantic and interactive behavior.
3. Application layouts
   * Verify or implement the `Public`, `Auth`, `AppShell`, and `Focus` layouts.
   * Provide a development-only `/design-system` route for inspecting the design-system components and their relevant states. It must not be exposed as a production application route.
4. Visual comparison
   * Compare the implemented design system against the approved `Design system.png` reference.
   * Record material discrepancies and resolve them, or explicitly document any remaining discrepancies for owner review.
5. Responsive behavior
   * Check the relevant design-system examples and layouts at viewport widths of 390, 768, 1024, 1280, and 1440 pixels.
   * Record the results and resolve unintended horizontal overflow and material layout failures.
6. Accessibility
   * Check keyboard navigation and visible focus states, semantic structure, and color contrast for the approved color combinations.
   * Record findings and resolve identified issues within the Phase 1 scope.
7. Quality checks and evidence
   * Run the agreed frontend build, lint, and relevant test checks.
   * Record the commands, results, and any known failures or limitations.
   * Do not claim a check passed unless its result has been verified.

**Explicit exclusions**

Phase 1 does not include real Google OAuth configuration or implementation, completion of D18 invitation identity verification, backend workflows, database integration, or database migrations. These remain separate work items and must not be introduced as dependencies for Phase 1 acceptance.

**Acceptance rule**

Phase 1 may be declared complete only after the criteria above have been checked against the actual implementation and the results recorded. Missing evidence is not proof of failure, but it is also not proof of completion. Any unresolved material discrepancy or failed check must be documented for review before Phase 1 is declared complete.

**Implementation guardrail**

Inspect the current repository and existing implementation before making changes. Prefer targeted corrections over rebuilding working code. Preserve existing approved decisions, original design references, and historical records. This decision approves the acceptance baseline only; it does not authorize implementation, unrelated changes, staging, commits, or pushes.

**Acceptance evidence recorded so far (not a completion claim)**

* 22 October 2026, criterion 6 (semantic structure): the `/design-system` preview now has one page-level `h1` (the preview title). Two mock frame headings, "Welcome back" in the Auth frame and "Welcome back, Sample" in the AppShell frame, were changed from `h1` to `h3` in `src/dev/design-system/DesignSystemPage.tsx`. Their rendered width and height matched the previous `h1` rendering at 390, 768, 1024, 1280 and 1440 pixels. No horizontal page overflow was observed at those widths.
* Known remaining item: `FocusLayout` renders its title as `h3` (`src/components/layout/FocusLayout.tsx`), which skips the level under the page `h1` in the preview. This is not yet resolved.
* The flagged unnamed icon-only button was checked and found to be a false positive: the notification icon already has an accessible name through its `role="img"` and `aria-label`. No change was made.
* Lint passed on the changed source. The production build and Playwright e2e tests were not rerun after this change.

**Verification pass, 22 October 2026 (evidence only; not a completion claim)**

* Files changed in this pass: `src/dev/design-system/DesignSystemPage.tsx` and `src/dev/design-system/DesignSystemPage.module.css`. `FocusLayout.tsx` was not changed in this pass.
* Preview changes covered by this pass:
  * Skip links in the PublicLayout, AppShell and FocusLayout frames move focus to their own frame's `<main>`. The hash and URL do not change.
  * Ordinary links inside the four layout frames no longer have an `href`, so they are not in the tab order.
  * Do and Avoid panels were added under the button variants table, using the reference wording.
  * The corner-radius panel is navy with a 12px figure. Its sample button reads "12PX RADIUS".
  * Each of the PublicLayout, AppShell and FocusLayout frames has a visible cue: "Ordinary links and buttons are illustrative. The skip link works." The AuthLayout frame has no cue, because it has no skip link.
  * Between 1024 px and 1145 px, the button-variant grid uses four state columns with each variant name on its own row. The Avoid heading uses the navy token.
* Responsive results, measured in the browser:
  * Before the change, buttons overflowed their borders at 1024 px (12 buttons, up to 31 px) and 1100 px (12 buttons, up to 12 px), with 4 buttons overflowing by up to 2 px at 1140 px. It was clean at 1146 px.
  * After the change, there were 0 overflowing buttons and 0 text collisions at 1024, 1080, 1100, 1120, 1140 and 1145 px.
  * At 1146, 1151, 1152, 1280 and 1440 px, the column widths match the earlier baseline measurements (110.25, 111.5, 111.75, 143.75 and 183.75 px).
  * At 390, 768 and 800 px the grid is one column, and the page does not scroll sideways.
* Keyboard results, at 1440 px:
  * A forward traversal reached 52 tab stops in order, with no gaps or stray stops. Each stop showed a visible focus ring.
  * The three skip links are stops 41, 45 and 49. Activating each one with Enter moves focus to its own frame's `<main>`.
  * The Course sections and Filter courses tablists can each be reached with Tab. Arrow keys change the selected tab, and Home and End move to the first and last tab.
* Commands run on the current code, with exit codes:
  * `npm run lint`: exit 0.
  * `npm run build`: exit 0.
  * `npm run test:e2e`: exit 0, 11 of 11 tests passed.
* Remaining evidence gaps:
  * No pixel-diff comparison was saved. The layout checks rely on measured geometry and screenshots reviewed on screen, which were not stored.
  * Intermediate widths were sampled, not exhaustively covered. The 1024–1145 px band was checked at 1024, 1080, 1100, 1120, 1140 and 1145 px. The upper widths were checked at 1146, 1151, 1152, 1280 and 1440 px. The single-column widths were checked at 390, 768 and 800 px.
  * The accessibility-tree role of the ordinary mock links is unresolved. The browser inspection tool still reports them as "link", although they have no `href` and cannot receive focus. The platform role was not confirmed.
* Unresolved items, for owner decision (no approval has been given):
  * Body copy in the Do and Avoid panels: the reference colour `#64748B` gives 4.37:1 and 4.48:1 on the tinted panels, below the 4.5:1 AA threshold for body text. The preview keeps `#0F172A`.
  * The FocusLayout title is an `h3` under the "Layouts" `h2` in the preview, so the outline has no skipped level there. That heading was not changed.
  * Whether the AuthLayout frame should also have a cue.

**Phase 1 acceptance, 22 October 2026: accepted with documented limitations**

Basis: each criterion above was checked against the evidence recorded in this entry and in the verification pass of 22 October 2026. No criterion has an unresolved failure. The limitations below are recorded for owner review. Accepting Phase 1 does not resolve them.

1. Tokens and global styles: **verified.** Colours, type scale, spacing, radius and shadow values match the reference values.
2. Reusable components: **verified** in the preview, with lint, build and E2E passing. The Neutral and Danger button variants are labelled "(added)" as extensions.
3. Application layouts: **verified** in the preview frames. `/design-system` is development-only (`src/App.tsx`). The links inside the frames are inert by design.
4. Visual comparison: **verified qualitatively** against the reference. Remaining discrepancies for owner review:
   * No saved pixel-diff comparison exists.
   * Body copy in the Do and Avoid panels: the preview keeps `#0F172A`. The reference grey `#64748B` gives 4.37:1 and 4.48:1 on the tinted panels, below the 4.5:1 AA threshold.
   * The primary button colour (`#C2410C`) and its hover (`#9A3412`) are the approved D1 exception to the reference `#F97316`.
   * The corner-radius label uses the D1 light blue (`#93C5FD`) on navy, not the reference orange.
5. Responsive behaviour: **verified** at 390, 768, 1024, 1280 and 1440 px, and at 800 px. The button-variant overlap in the 1024–1145 px band was corrected and re-measured. Intermediate widths were sampled, not covered exhaustively.
6. Accessibility: **verified** for the 52-stop forward keyboard traversal with visible focus, the three skip links, the Tabs controls, a single page-level `h1`, and the D1 colour pairings. Remaining limitations:
   * The platform accessibility role of the ordinary mock links is unconfirmed. They have no `href` and cannot receive focus, but the browser inspection tool still reports them as "link".
   * In the preview, the FocusLayout title is an `h3` under the Layouts `h2`, so the outline has no skipped level.
7. Quality checks: **verified** on the current code. `npm run lint` exit 0. `npm run build` exit 0. `npm run test:e2e` exit 0, 11 of 11 passed. Known limitation: the database test suite (`supabase test db`) has previously reported failures in 010, 020 and 030 from local test residue. It was not rerun. Database checks are outside Phase 1 scope under the explicit exclusions.

The explicit exclusions are unaffected. Phase 1 does not include Google OAuth, D18 completion, backend work, database integration or migrations.

No approval decision has changed. D1 colours, D24 unavailable navigation and the D27 demo layer remain as approved. This acceptance does not approve the open owner decisions listed above.

**Implemented in:**

* Phase 1 foundation commit `1ee920d` (`chore: establish platform foundations`): design tokens, the `/design-system` preview and the UI components.
* Phase 1 layout and focus commits: `09139a4`, `e34f884`, `f1ad3a8`, `38a7f60`, `ffb7fe6` and `90e8752`.
* Verification tooling: `bc3d796` (Playwright end-to-end setup).
* Committed as `4fcd953` on `phase-1-foundations` (`feat(design-system): complete Phase 1 foundation verification`). The commit contains the 22 October 2026 preview corrections in `src/dev/design-system/DesignSystemPage.tsx`, `src/dev/design-system/DesignSystemPage.module.css` and `src/components/layout/FocusLayout.tsx` (heading level). This acceptance record was updated after that commit and is not part of it: the committed copy of this file still reads "Uncommitted at acceptance". Phase 1 was accepted with the limitations listed above, and the commit records the implementation state that was accepted.
## D29 — Phase 2: visual verification and closure (accepted 23 October 2026)

**Status:** The visual-verification method below was **approved by the owner on 23 October 2026**. Phase 2 closure was **accepted by the project owner on 23 October 2026**, as recorded in the acceptance block below. **Acceptance: recorded below.** Evidence and limitations are recorded in `docs/phase-2-closure-record.md` (untracked, not yet committed). Last verified 23 October 2026 after the targeted visual corrections: 77 of 77 E2E tests passed; typecheck, lint and production build exited 0; the production route boundary was confirmed (only `/` renders). The corrected comparisons (sign-in error, sign-up, sign-in at 390 px, landing and course detail) were accepted by the owner, as recorded below.

**Owner acceptance of Phase 2 closure (23 October 2026)**
- **Decision:** the project owner accepted Phase 2 closure, subject to the documentation-only changes recorded here and in `docs/phase-2-closure-record.md`.
- **Visual review:** the owner accepted Claude's post-correction visual review and recommendation for the five comparisons: sign-in error and sign-up at 1440 px, sign-in at 390 px, landing at 1440 px (hero placeholder masked for the metric), and course detail at 1440 px. ChatGPT did not independently inspect the five PNG comparisons. The comparison images are not committed to the repository.
- **Verification relied on:** typecheck, lint and production build exited 0. Playwright E2E passed 77 of 77. The production route-boundary checks passed: only `/` renders, and the other development routes show Not Found. No horizontal overflow was found at 390, 768, 1024, 1280 and 1440 px on the six tested screens. These results are from the 23 October 2026 run after the visual corrections. They were not rerun for this entry.
- **Recorded differences, not design matches:** photo placeholders (D3, D27); the demo notices required by D27; the disabled request-demo button; the dimmed "Learn about teaching." link (D24); the disabled "Contact support" button; the course-detail sample-data banner and image placeholder; and the landing background network, which differs from the reference and is subtle. The full list is in `docs/phase-2-closure-record.md`, section 6.
- **Baselines:** screenshot baselines remain outside the repository for now. Storing them in the repository is a separate future owner decision.
- **Unresolved, non-blocking:** the For Organizations destination (D24), and the D15 approval-date discrepancy between the 23 October status line and the 22 October owner-confirmations block. Neither is resolved here, and neither blocks this acceptance.

**Scope (proposed):** public screens in the development build: the landing page (`/`, built), the course detail page (`/courses/:courseId`, development build), the sign-in, sign-in error and sign-up mock screens (D27), and `/request-demo` (visual-only, D27, to be implemented). Deferred: Accept invitation (D15, D18) and Not linked (C7, D8).

**Visual verification method (approved 23 October 2026)**
- **Viewports:** 390, 768, 1024, 1280 and 1440 px, measured in the development build with Playwright.
- **Design comparison only where an applicable reference exists.** Desktop reference frames exist for the in-scope screens. The sign-in layouts also have a mobile reference (`design-reference/2 Screens/Auth [Ready].png`, frame 3, about 392 px). Confirm the crop width of each reference frame when it is cropped; the landing board file is 1640 px wide.
- **Unsupported widths and screens without a reference** (for example the landing page at 390 px, and every in-scope screen at 768, 1024 and 1280 px): record layout and overflow observations only. Do not record them as design matches.
- **Screenshot conditions:** disable animation, including the landing page's background network. Mask the hero placeholder where it overlaps a comparison.
- **Conditions:** record the font and network state for each run. Inter loads from Google Fonts (`index.html`).
- **Baselines:** generated baselines are kept separate from original design assets. Nothing is written to `design-reference/`. Baselines are not committed without a separate owner decision.
- **Review:** each screenshot set is reviewed by the owner, and the findings are recorded in this entry.
- **Tooling:** `@playwright/test` is already in use (`bc3d796`). This method adds no new dependency.

**Known limitations (to carry into the closure record)**
- Hero photo: labelled placeholder; the original photo is not exported (D3, D14).
- Partner logos and course thumbnails are placeholders. Sample course and dashboard data are development-only (D27).
- Google sign-in and the sign-up action are inert. No authentication behaviour exists (D15, D27).
- Request-a-demo submission is unavailable (D27).
- Enroll is disabled (D8, D11, D15).
- Unavailable navigation items follow D24. The For Organizations destination is an open owner decision (D24).
- Accept invitation and Not linked are not implemented (D15, D18, C7).
- Production exposes only `/` and the Not Found page. The production build's freedom from development routes and sample data was verified on 23 October 2026, as recorded in `docs/phase-2-closure-record.md`.

**Closure criteria (met, as recorded in `docs/phase-2-closure-record.md`, 23 October 2026)**
1. `/request-demo` is implemented as authorised by D27, with submission unavailable and E2E coverage.
2. The in-scope screens are implemented on their approved routes.
3. Lint, build and E2E pass on the final state, with results recorded.
4. Screenshots are captured and reviewed at the five viewports, and layout and overflow results are recorded.
5. Every design comparison records its differences. No difference is left unrecorded.
6. The production build is checked for development routes and sample data.
7. The limitations above are confirmed and carried into the closure record.
8. The owner's closure decision is recorded in this entry.

## D30 — Learner course completion and completion page

**Confirmed in conversation (23 October 2026) — provisional frontend approval; supplements D19 and D27**

**Completion rule (owner-approved).** A course is complete when all required learning activities are completed and all required quizzes are passed.

**Operational details not yet decided**
- Which learning activities can be marked required, and how a requirement is configured in a course.
- What evidence establishes that a required learning activity is completed.
- What evidence establishes that a required quiz is passed. The requirement to pass required quizzes is decided. The grading and attempt rules that determine a pass, including which attempt counts, remain unresolved under D19.
- How completion behaves if course requirements change after a learner has completed the course.

**Pass mark.** The default pass mark is 70%, as recorded in D19. This entry does not change D19. D19's unresolved attempt and grading details remain unresolved.

**Completion page (provisional frontend approval).** The Congratulations layout from the fourth frame of `design-reference/2 Screens/Course player [Needs review].png` is provisionally approved for frontend implementation at `/learn/courses/:courseId/complete`, excluding all certificate features. This is not final approval of the original design board, whose status remains "Needs review".

**Authorized frontend preview: scope and limits**
- Uses clearly identified, illustrative mock data.
- Does not calculate or claim the current learner's actual completion status.
- Does not persist completion, calculate real eligibility, or implement certificates.
- May display a sample completed state as 100%. The displayed 100% is illustrative sample content only; it must not be derived from, or presented as, a calculation of a real learner's completion status. This does not establish a general completion-percentage calculation rule.
- Remains behind the existing learner development-only gate (D27).

**Certificate exclusions.** While eligibility, issuance, content and verification requirements remain undecided, the completion page must not contain a certificate preview, a certificate download action, certificate eligibility behaviour, or issuance behaviour. This applies whether such an element is enabled or disabled.

**Certificates.** Certificates remain in planned scope. Their implementation is deferred until eligibility, issuance, content and verification requirements are decided.

**Server enforcement.** When a backend exists, completion status must be calculated and enforced on the server (D19: grading happens on the server; D21).

**Relationship to other records.** D30 supplements D19 and D27 and supersedes nothing. The D27 "not designed" note on certificates (line 448) and the Phase 3 closure record's open completion-route item (section 4, item 3) are clarified by the dated notes below. Their original text is unchanged.

**Explicit exclusions.** Defining or implementing a general completion-percentage calculation rule; unresolved quiz retake and attempt rules; recalculation or preservation rules for changed requirements; certificate features; course ratings and notes (D7). This exclusion does not prohibit future design work on legitimate progress indicators.

**Open items.**
1. The definition of a "required learning activity" and how it is configured.
2. The completion evidence for learning activities.
3. The pass evidence for quizzes, under D19.
4. The behaviour when requirements change after completion.
5. The relationship to "Required courses and due dates" (D7).

## D31 — Organization domains, invitations and course access

**Confirmed in conversation (25 October 2026)**

*Domains and admission*
- An organization domain is verified with a DNS TXT record.
- Verification alone grants no membership.
- Domain admission is off until an authorized administrator turns it on explicitly.
- People admitted through domain admission join as Learners only. Admission never grants Instructor or administrator access.
- Turning admission off stops new admissions only. Existing members keep their membership.

*Invitations*
- Each invitation is bound to the invited email address, and the invitee accepts with that address.
- An existing account with that address is reused. No second account is created.
- Invitations expire seven days after they are sent, as D18 states.
- Invitations can be revoked, under D18-A.
- Administrators see pending invitations until they are accepted.

*Course access*
- Course access requires active membership in an active organization.
- Email-domain matching alone never grants course access.

*Unlinked users*
- The unlinked-user page is shown after Google sign-in when no membership matches. It is not part of public navigation.

*Certificates*
- Certificates remain deferred under D30.

*Correction*
- An earlier confirmation summary gave an invitation expiry of 72 hours. That figure was wrong. D18's seven days stands.

**Not decided by this entry (open)**
- Whether a DNS verification check may time out, and who decides. No automatic failure deadline is set.
- Organization activation. The proposed model is Platform Admin review. It is not recorded as policy here.
- Whether an organization may be activated without an Organization Admin.
- Who may send learner invitations, and whether Instructors may also invite learners.
- Whether members' roles can change, and by whom.
- Whether Instructors may see learner progress and reports.
- Which platform reports exist, and which learner information Platform Admins may see (D17).

## D32 — Owner approvals of 21 October 2026

*Approved in conversation on 21 October 2026 and recorded here on 26 October 2026. The decision IDs (F, I, C, G, L) are those of the architecture plan (Revisions 2–3.2.1) and the 21 October review. Older entries keep their text; see the amendment index.*

**Confirmed in conversation (21 October 2026): foundations**
- **F1 Access model:** anyone may browse published public course outlines. Google sign-in creates a learner account with no organization membership and no privileged role. Signed-in learners may enrol themselves in open public courses. Organization membership and privileged roles come only from an accepted invitation or an administrator action, never self-assignment or email-domain matching.
- **F2 Roles:** `org_admin`, `instructor` and `learner`, several per organization; Platform Admin is separate.
- **F3** Only Platform Admins grant `org_admin`. Organization Admins manage Instructor and Learner roles in their own organization.
- **F4 Organization lifecycle:** draft (Organization Admins and Instructors only), active (all members), suspended (no organization access; people keep read access to their own records).
- **F5 Removal:** removing a member revokes access immediately, keeps their records and audit history, and never hard-deletes.
- **F6** Platform Admins are created only through owner-run, audited SQL, never through the application.
- **F8** People and organizations are never hard-deleted: accounts are deactivated and later anonymized; memberships are marked removed.

**Confirmed in conversation (21 October 2026): invitations**
- **I1** Organization Admins revoke the invitations they may send; Platform Admins may revoke any (refined by D18-A, 23 October 2026).
- **I2** An expired or revoked invitation is reissued only as a new invitation; the old link never works again.
- **I3** Platform Admins may also invite Instructors and Learners.
- **I6** The acceptance screen needs design approval; its implementation is deferred (D18).
- **C1** Learners invited to a draft organization get no access until it is active. Invited Instructors and Organization Admins may work in draft organizations, as F4 allows.
- **C2** Acceptance is refused for a suspended membership until an administrator lifts the suspension. A removed membership is reactivated with only the invited role; previous roles are cleared and the change is audited.
- **G9** Migration 0004 is database-only: invitations; create, revoke, accept and preview functions; tests. Email delivery and secure token generation come later in a server function.
- Nobody may invite their own email address or accept an invitation they created, including Platform Admins.
- Invitation email matching ignores case and requires the Google account's email to equal the invited address.

**Confirmed in conversation (21 October 2026): learner information**
- **G1** Organization Admins' access to individual scores and pass/fail covers members of their organization only. Public learners in an organization's public course are visible to that course's staff only; Organization Admins receive no aggregates about them.
- **G2** Instructors may see learner names, progress and results for courses they teach, and answers as the quiz policy allows. They never see learners' email addresses.
- **G3** Organization Admins have no override to view individual assessment answers in the first release.

**Confirmed in conversation (21 October 2026): courses**
- **L2** Organization courses are published only with the approval of an Organization Admin of the owning organization. As refined by D34, P22 (26 October 2026), the approver is never the person who proposed the course: another Organization Admin of that organization, or a Platform Admin, approves.
- **L3** Previews are optional, for public courses only, text only, and require explicit approval.
- **L5** Members join organization courses by Organization Admin assignment, with optional due dates. Restricted public enrolment, invitation-only courses and enrolment approvals stay outside the first release.
- **L6** Every lesson is required. The pass mark defaults to 70% and is set per quiz.
- **L7(a)** No file access unless the file's downloadable flag is enabled. Protected material that must not be downloaded belongs in the lesson text.
- **L8** Organizations may publish public courses with public outlines; self-enrolment applies only where it is enabled; no aggregate reporting about public (external) learners in the first release.
- **L11** Option (a). P1, routine: a Platform Admin sees an organization's Organization Admins and its pending Organization Admin invitations. P2, support: a lookup that requires a case reference and a reason, with every call audited. P3: no Platform Admin access to learning records (enrolments, progress, attempts, answers, lesson content). This records the L11 wording that D27 deferred to Priority 4. Routine invitation visibility also includes the invitations a Platform Admin sent themselves (I3), as applied by D34, P15.
- **L13** Learners with an active or completed enrolment keep read-only access to an archived course's content while the organization remains accessible. No new enrolments, completions or quiz submissions.
- Platform Admins alone activate and suspend organizations.

**Confirmed in conversation (21 October 2026): corrections and quizzes**
- **G4** A correction to a published course always needs two different people. The proposer never approves their own correction, even when they hold several roles.
- **G5** Retakes after passing are a per-quiz setting, off by default.
- **G6** No quiz closing dates in the first release. Answer-reveal policies are "after final attempt" (default) or "never".
- **G7** Under "after final attempt", answers are revealed when the learner has no attempts left, including after passing early. Under "never", answers stay hidden.
- **G8** Explanations are stored in a separate, staff-only table.
- Assessments allow three attempts by default. Answers stay hidden while attempts remain. No practice quizzes in the first release.
- **Combined retake rule (D19 and G5):** learners may retake a quiz while attempts remain; after passing, only where that quiz enables retakes.

**Effect on D31's open list.** D31's text is unchanged. Its open items are settled as follows: Instructors' access to learner progress and results by G2; role changes by F3; organization activation by Platform Admins only (the remaining question is D34, P12); who sends learner invitations by D6, D18 and I3 (Organization Admins and Platform Admins, not Instructors); Platform Admins' access to learner information by L11 and D17, with platform figures limited by D34, P19; DNS verification timing by D34, P14 (deferred).

## D33 — Google identity policy for invitations

*Previously recorded only in `docs/d18-security-review-2026-10-22.md`, section 7. Recorded here on 26 October 2026.*

**Confirmed in conversation (22 October 2026)**
- Invitation preview and acceptance are refused when the Google identity evidence is contradictory, ambiguous or cannot be verified (strict). This covers another Google identity on the same account that is unverified or carries a different email; a missing or non-boolean `email_verified`, or a null email; and a Workspace account whose `hd` claim is missing, unusable or different from the email domain.
- Only `gmail.com` accounts, and Google Workspace accounts whose `hd` claim equals the email domain, are eligible. `googlemail.com` is not eligible. Any change needs the owner's explicit approval.
- This is the mechanism for D18's verified-email requirement and the 22 October 2026 "Invitation email verification" confirmation. It is **planned** for migration 0006 (D34, T1). Migration 0006 is not yet written, applied or tested. It is blocked until owner-performed Google sign-in evidence exists and its tests have run; until then the policy is untested.

## D34 — Final decision session

*Approved in conversation on 26 October 2026 as one consolidated sheet (P1–P23, T1–T12). Approving the sheet did not authorize editing this file, database backup or reset, applying migrations, committing, pushing or backend implementation; each needs separate approval.*

**Confirmed in conversation (26 October 2026): courses and publishing**
- **P1** Platform Admins create platform-owned courses and may add Instructors as course staff. A Platform Admin approves publication, never the person who proposed it. Publishing platform courses therefore needs at least two Platform Admins.
- **P2** Lesson previews (L3) are approved by the course's publishing approver (L2, P1, P22), never by the proposer.
- **P3** Instructors and Organization Admins create draft courses in their own organization; the creator becomes course staff. Organization Admins add and remove course staff. Course staff edit drafts only.
- **P4** Corrections to published courses (completes L1): typo, formatting or broken-link replacement only, with a reason code and an attestation that the meaning does not change. Course title, summary and thumbnail changes go through the approver. The full old and new text is kept, and each correction can be reverted with the same approval. Two different people (G4).
- **P5** Course versioning comes after the first release. Until then, a published course's structure and quizzes are frozen; a substantive change means archiving the course and publishing a new one; completion records and quiz attempts never change.
- **P6** Public course pages show the instructor's display name only, for published public courses only.
- **P22** Nobody approves publication of a course they proposed. Another Organization Admin of that organization, or a Platform Admin, approves it. Refines L2.

**Confirmed in conversation (26 October 2026): learners, enrolment and completion**
- **P7** Organization Admins see the email addresses of their organization's active members; never public learners' (G1).
- **P8** "Mark as done" completes a video or reading lesson; passing completes a quiz lesson; quiz lessons count in the lesson total. Settles D30 open items 1 and 2 under L6.
- **P9** A quiz is passed when any attempt reaches its pass mark; the best score is recorded. Retakes follow D19 and G5. Because published quizzes are frozen (P5), historical attempts stay interpretable (D19's open point).
- **P10** Members cannot enrol themselves in organization-only courses; Organization Admins assign them (L5). Self-enrolment applies only to open public courses (L8).
- **P11** When an organization is suspended, none of its public courses is available, whether published or archived: they leave the public catalogue, and their outlines, previews, lesson content, files and quizzes cannot be opened. Its existing public learners keep read-only access to their own records only (enrolments, lesson progress and quiz attempts), as members do under F4 and D27. No new enrolments, lesson completions or quiz submissions. On reactivation, access returns under L8 and L13. This follows F4, D27 and L13's condition that the organization remains accessible.

**Confirmed in conversation (26 October 2026): organizations, sign-in and invitations**
- **P12** An organization can be activated only after at least one Organization Admin has accepted their invitation.
- **P13** Ordinary sign-in always creates or reuses a learner account (F1). The "not linked" page appears only when someone arrives through an organization's sign-in link and has no membership in that organization. Resolves C7 (D8) and D31's unlinked-user rule together.
- **P14** The first release is invitations-only. Domain verification and domain admission are deferred to a later release; D4 and D31 apply unchanged when they are built. No domains table and no DNS server function in the first release. The development "Invitations and domains" page labels its domain section as a later release (P21). Project instructions §5 ("multiple approved domains") remain a platform capability, deferred, not removed.
- **P15** Planned migration 0006 (not yet written, applied or tested; see T1) narrows ordinary invitation visibility. Until it is applied and its tests pass, migration 0004's broader policy stays in force in the local database.
  - **Routine visibility (L11 P1 and I3):** Organization Admins keep reading every invitation of their own organization. A Platform Admin reads, in any organization, pending Organization Admin invitations and the invitations they sent themselves, of any status. Nothing else is readable directly.
  - **Support lookup (L11 P2):** `platform_find_invitations(p_case_ref text, p_reason text, p_org uuid default null, p_email text default null, p_invitation uuid default null)` locates invitations the caller cannot ordinarily read. It runs with its owner's rights, is executable by signed-in users only, and refuses anyone who is not an active Platform Admin (42501). It requires a non-blank case reference and reason, and at least one locator: an organization, an exact email address (matched ignoring case; no partial or wildcard search) or an invitation ID. It returns at most a bounded number of rows, newest first, with invitation fields only: `id`, `org_id`, `email`, `role`, `status`, `invited_by`, `created_at`, `expires_at`, `accepted_at`, `revoked_at`. It never returns `token_hash`, profile data or learning-record fields (L11 P3). Every completed call writes exactly one row to `private.platform_admin_audit` (caller, case reference, reason, locator values, number of rows returned); a refused call returns an error and no rows.
  - **Revocation (D18-A), unchanged:** `revoke_invitation`, `create_invitation`, `accept_invitation` and `preview_invitation`, their grants and the column permissions on `invitations` are not changed. A Platform Admin can revoke any pending invitation, including one they cannot ordinarily read: they find it through the support lookup, then call `revoke_invitation` with its ID. Organization Admins revoke as D18-A allows. Row Level Security is not forced on `invitations`; if it ever is, `revoke_invitation` must be updated in the same change.
  - **Required tests (T11):** deployed definitions, security settings and grants of these functions; visibility for every role through the real REST API and direct SQL; Platform Admin revocation of an invitation they cannot ordinarily read; the support lookup's refusals, its single audit row per completed call and its returned columns; GraphQL confirmed unavailable (T4). Tests that have not run are reported as not run.

**Confirmed in conversation (26 October 2026): files, sharing, reports and scope**
- **P16** Private files and video live in private Supabase Storage and are served through signed URLs that expire after 15 minutes (D20); the player requests fresh URLs before expiry. Unlisted YouTube links are allowed only for public, non-sensitive courses (D5). **Limitation:** signed URLs control who may fetch a file and for how long; they cannot prevent downloading, copying or recording while content is accessible.
- **P17** No separate access grants in the first release. D20 is unchanged: protected resources are available to enrolled learners (the explicit-grant route is not built yet), and downloads need both an authorization check and the downloadable flag (L7(a)).
- **P18** No course sharing between organizations in the first release (D16).
- **P19** Platform reports show only these current counts, from organization, membership, invitation and course records, never from enrolment, progress or quiz data:
  - A1 organizations, total and by status (draft, active, suspended);
  - A2 each organization's status, creation date and activation date;
  - A3 active Organization Admins and active Instructors per organization;
  - A4 active learner memberships per organization, counted only. A4, and the production Organizations page's Learners column, count only active learner memberships within that organization; public learners and public-course-only relationships are excluded;
  - A5 pending invitations by role, per organization and in total;
  - A6 courses by owner (platform or organization) and status (draft, published, archived);
  - A7 the number of Platform Admins.

  No date ranges, cohorts, time series or filters other than organization and status. No learner identities, individual activity, last-active times, enrolments, progress, completions, scores or attempts, and no figure about public learners. Served by one checked database function whose result columns are tested. Answers D17's open question on aggregate figures. In production, the "Users and roles" page is limited to L11 P1 and the P2 lookup; the full user list exists only in the development demo.
- **P20** "AQS Owner" is a Platform Admin capability in the first release, not a separate role (D22). Platform Admins are created only by the owner (F6, D18-B).
- **P21** Outside the first release: messaging, certificates, notifications other than invitation emails, enrolment approvals and invitation-only courses. Deferred features stay visibly non-functional placeholders (dimmed, "not available yet" or "coming later", with disabled controls), never wired to appear to work (D7, D24).
- **P23** Before any production release, the landing-page lines about certificates and messaging are changed or clearly marked "coming later": the step "Learn and earn a certificate" ("Complete lessons and earn your certificate."), the feature "Certificates" ("Earn a certificate when you complete a course.") and the feature "Messaging with instructors" ("Ask questions and get guidance from your instructor."). The approved design's layout stays. No copy is changed now; the replacement or label wording needs the owner's approval when it is made.

**Confirmed in conversation (26 October 2026): technical defaults**
- **T1** Migration order: 0005 interim invitation-preview fix (exists and uncommitted; reported as applied locally on 22 October 2026, not re-checked; see D35) · 0006 verified Google identity (D33) and P15, **planned: not yet written, applied or tested, and blocked until owner-performed Google sign-in evidence exists and its tests have run** · 0007 courses, course staff, modules, lessons, content and files; publishing and preview approval; corrections, revert and clone; P6, P11, L13 · 0008 enrolment and lesson progress · 0009 quizzes, questions, options, answer keys, explanations, attempts and answers · 0010 Storage buckets and file policies · 0011 the platform-report function (P19) · domain verification and admission later, numbered when approved (P14). Applied migrations are never edited.
- **T2** Backup and restore test before any reset: read-only checks; a backup to files outside the repository (roles, schema and data dumps, plus a full `pg_dump` copy); a restore into a throwaway container from the same database image, never the project database. The two databases are compared on row counts, migration history, schemas, extensions, columns, enum types, constraints, indexes, triggers, functions (definition, security setting, `search_path`, owner), Row Level Security flags, policies, table, column, function and schema permissions, default permissions, owners, views, roles, and Storage buckets and policies. Any difference means stop: no reset. Reset and committing migration 0005 each need separate approval.
- **T3** Keep `email_matches` (always true) until the acceptance screen is built, then remove it in a later migration.
- **T4** Supabase's GraphQL interface is turned off for this project. The application uses REST and database functions only. Access rules are tested through REST, database-function calls and direct SQL; separate tests confirm the GraphQL endpoint is unavailable to signed-out and signed-in callers and exposes no table, function or type. Enabling GraphQL later needs separate approval, and every visibility test must then also pass through GraphQL before release.
- **T5** All writes go through checked database functions; reads go through Row Level Security and column permissions. The browser never writes to tables directly, and the service key never reaches the frontend.
- **T6** Supabase Edge Functions handle invitation tokens and invitation emails. Render serves only the static frontend. Secrets live only in the function settings.
- **T7** Google-only sign-in, email sign-up off, PKCE, and an allow-list of redirect URLs per environment.
- **T8** A public bucket for thumbnails of published public courses only; private buckets for course materials and video; 15-minute signed URLs; downloads only with the downloadable flag; upload size and type limits.
- **T9** Audit records use the existing append-only tables `private.platform_admin_audit` (migration 0002) and `private.organization_audit` (migration 0003), written by database functions; organization records carry the organization ID so an Organization Admin audit view (L10) can be added later. No separate `audit_events` table.
- **T10** Quiz grading on the server, locked per learner so attempt limits hold under concurrency; duplicate submissions are counted once (D19); submission responses carry only the score and pass/fail.
- **T11** Every migration is tested on a freshly reset local database with the pgTAP suite; through the real REST API and database-function calls; with GraphQL confirmed unavailable (T4); with checks of deployed function definitions, security settings and grants; and with file-hash and staging checks before any commit. Migration 0006 must also verify invitation visibility through the actual API, Platform Admin revocation of invitations they cannot ordinarily read, and the audited support lookup (P15). Tests that have not run are reported as not run, never as passed.
- **T12** The frontend moves to real data one area at a time behind the same service interfaces (A4); development mocks stay development-only (A6).

**Table count.** The first release has 22 tables in the `public` schema: the plan's 21, plus the explanations table (G8), minus the planned `audit_events` table, which T9 replaces. The two private audit tables above are in addition. G8 itself is unchanged.

**Also recorded.** About (`/about`) and Contact (`/contact`) exist as development-only pages, authorized on 26 October 2026, with company and contact details shown as labelled placeholders. In production builds both stay unavailable (D24, D27). D24's text is unchanged.

**Open (not decided by this entry)**
- Privacy Policy, Terms and Cookie Policy content: the approved legal text is not in the repository or the Project.
- The For Organizations link destination (D24).
- L10 (Organization Admin audit view), B1–B4 (before cloud setup), R1–R5 (before real personal data) and the email provider (Q-C7).

## D35 — Migration 0005 and local database status

*Recorded fact from a read-only check of the repository files on 26 October 2026. No decision. The local database was not queried on 26 October 2026; statements about it below are reports from earlier documents.*

**Verified from the files on 26 October 2026**
- `supabase/migrations/20261022210000_0005_preview_email_gate.sql` is untracked and byte-for-byte identical to `docs/review-artifacts/preview_email_gate.DRAFT.sql`. It replaces only `public.preview_invitation`, so that a signed-in user whose account email does not match receives no preview row. Its header still says "NOT APPLIED"; the file is deliberately not edited.
- Related uncommitted changes: `supabase/config.toml` (email sign-up disabled; a Google provider block that reads its credentials from environment variables), `supabase/tests/database/030_invitations.test.sql` (88 tests) and `tests/api/invitations.api.test.mjs`.
- The verified-identity drafts in `docs/review-artifacts/` are not in `supabase/migrations/`.
- The pgTAP files declare 298 tests in total (31 + 70 + 99 + 88 + 10). No `supabase/seed.sql` exists.
- Committed migration 0004's `invitations_select` policy lets any Platform Admin read every invitation. Planned migration 0006 (D34, P15) will narrow it; 0004 is not edited.

**Reported earlier, not independently checked on 26 October 2026**
- `docs/d18-security-review-2026-10-22.md`, section 12, reports that migration 0005 was applied locally on 22 October 2026 (`supabase migration up --local`) and that the local migration list then showed 0001–0004 and `20261022210000` applied.
- The same review reports test residue in the local database from earlier API runs, causing several pgTAP failures.
- Google sign-in evidence did not exist at that review, and none has been collected since.

**Next steps, each needing separate owner approval (D34, T2):** the read-only database checks, backup and restore test; any reset; committing migration 0005.

## D36 — First Platform Admin on staging

*Recorded 27 October 2026 from the owner's report. Staging only: Supabase project `aqs-staging` (ref `txpaszokduxewyojrnmq`), synthetic data. Relates to D18-B; D18's text is unchanged. No account email or user ID is recorded here.*

**Confirmed in conversation (27 October 2026): owner-approved staging procedure**
- For staging, the owner-controlled procedure that D18-B requires is `docs/staging-runbook.md` §6: the account signs in once with Google, which creates its profile; the owner then runs `private.grant_platform_admin(user_id, operator, reason)` in the staging project's SQL editor.
- The procedure is defined in migration 0002. Only `postgres` can run it, it grants Platform Admin to the one account given, and each grant is recorded in `private.platform_admin_audit` (D18-B: who, whom, when, why).
- This approval covers staging only. Production's first Platform Admin needs its own owner-approved step when production is set up.

**Reported by the owner (27 October 2026), not independently verified**
- Google sign-in works locally against `aqs-staging`.
- Before the grant, the intended account's Auth user ID matched its `profiles.id`, and `public.platform_admins` had zero rows.
- The owner ran `private.grant_platform_admin(...)` in staging.
- The app now recognizes the intended account as a Platform Admin.

**Not established by this entry**
- Production readiness. Production is a separate, owner-approved launch with its own project, Auth settings and first Platform Admin.
- Independent checks of the resulting `public.platform_admins` row and its `private.platform_admin_audit` entry, and of the stored Google identity (`docs/staging-runbook.md` §3, step 4).
- The second Platform Admin (P1), invitations, organization isolation and the staging API checks (`docs/staging-runbook.md` §6–7).

## D37 — Public instructor names and course archiving (owner decisions, 31 October 2026)

- **Q-07-6 (refines P6):** public course pages show the display names of current course staff who hold the Instructor role only. Organization Admins and Platform Admins are not shown because of course-management permissions. Platform-course eligibility is unchanged (Q-07-1 as built in 0007: an Instructor in a draft or active organization).
- **Q-07-10 (refines P5):** an organization's course is archived only by an Organization Admin of that organization. Being a Platform Admin alone does not permit it (consistent with L11); a Platform Admin may archive only if they independently hold the Organization Admin role in the owning organization. Platform courses are archived by Platform Admins.

## D38 — Working defaults confirmed (owner decisions, 2 November 2026)

*Recorded 2 November 2026 from the owner's approval of `claude/d38-working-defaults-decision-list-2026-11-02.md` (Claude Project). Source of the rules: `docs/review-artifacts/final-review-package-2026-10-26.md` §2 and `docs/progress-report.md` ("Working defaults"). Older entries keep their text. Evidence labels: **verified** = read in the migrations or code, or observed on staging, on 2 November 2026; **reported** = stated in the review package or progress report and not independently re-checked. A reported behaviour is approved as a working interpretation; it is not claimed as proven by a test.*

**Confirmed in conversation (2 November 2026): interpretations of existing decisions**
- Q-06-1 (D18, D33): acceptance and preview check the verified Google identity before revealing an invitation's status or expiry. *Verified (0006; staging, Stage 0).*
- Q-06-3 (P15): a refused support lookup writes no audit row; a completed lookup writes exactly one. *Reported.*
- Q-07-3 (P22, G4): a course is locked while its publication request is pending. *Reported.*
- Q-07-7 (F4, P11): a draft organization's public course is not listed. *Reported.*
- Q-07-9 (P2, P22): lesson-preview approval refuses both the preview requester and the course's publication proposer, and works only while a publication request is pending. *Verified (0007).*
- Q-08-3 (F5): removing a member ends their assigned enrolment in that organization's courses. *Reported.*
- Q-08-4 (L5, P10): assignment is to Learners of that organization only, for organization courses only; an existing enrolment is never replaced; a due date must be in the future. *Verified (0008).*
- Q-P12-1 (P12): activation counts only an accepted Organization Admin invitation, not a directly granted role. *Verified (0005b).*

**Confirmed in conversation (2 November 2026): technical choices**
- Q-06-5 emails are trimmed and compared ignoring case (*reported*); Q-07-4 corrections are stored in a private table written only by functions (*reported*); Q-07-11 a proposer withdraws rather than declines their own request (*reported*); Q-07-14 removing the last staff member of a draft is allowed (*reported*); Q-07-16 corrections were built in migration 0009a (*verified*); Q-08-6 lesson completions are not audited row by row (*reported*); Q-P4-3 a correction against text that has since changed must be re-proposed (*reported*); Q-06-4 `private.platform_admin_audit.user_id` is the person granted on grant rows and the searching Platform Admin on lookup rows; no separate actor column in the first release (*verified*).

**Confirmed in conversation (2 November 2026): product decisions**
1. Q-06-2: support lookups accept a case reference of 1–100 characters and a reason of 1–1000, and return at most 50 rows, newest first. *Verified.*
2. Q-06-6: no rate limit on support lookups in the first release; every completed lookup is audited and the audit log is reviewed periodically. *Reported.*
3. Q-06-7: email addresses searched by Platform Admins remain in the append-only audit log; accepted for staging and included in the retention review (R4, F8) before real personal data.
4. Q-07-2: a Platform Admin may approve an organization course's publication from its outline only, without lesson text (L11 P3); such an approval does not cover lesson text. *Reported.*
5. Q-07-5: a video lesson uses a private Storage object, or an unlisted YouTube ID on public courses only, with the approver's "non-sensitive" attestation. *Reported.*
6. Q-07-8 / Q-10-1: course titles 2–200 characters, other titles 1–200, file names 1–255, reasons 1–1000; course files 100 MB, video 500 MB (MP4, WebM), thumbnails 5 MB (PNG, JPEG, WebP). Supabase's Free plan caps every upload at 50 MB; the plan for real video is decided separately. The player requests a fresh 15-minute URL before expiry. *Verified (limits), reported (player refresh).*
7. **Q-07-12 (changed from the implementation):** learners must not have broad read access to the account IDs of a course's creator, proposer, approver and archiver. These columns are to be restricted to staff and administrative functions in a migration during M2. The current full-table read grant (0007) is *verified* and is not accepted. Applying the migration needs separate owner approval.
8. Q-07-13: public course pages do not show the owning organization's name. *Verified.*
9. Q-07-15 / Q-10-2: deleting a file record does not delete its Storage object; staff remove objects while the course is a draft, and a scheduled cleanup is built before real personal data. Organization-only course thumbnails are kept in the private materials bucket; public courses use the public bucket; files are frozen once published. *Reported.*
10. **Q-08-1 (changed from the implementation):** when an organization is suspended, its learners continue to see the titles of their own enrolled courses, alongside their own records (P11). To be implemented in M3; any migration needs separate owner approval.
11. Q-08-2: Platform Admins who are staff of a platform course see that course's learners; L11 P3 applies to organization courses only. *Reported.*
12. Q-08-5: no un-enrolment, withdrawal or due-date change in the first release. *Verified (no such functions).*
13. Q-08-7: new courses default to the "assigned" enrolment policy; a public platform course must be set to "open" before publication. A usability guard is added in M2. *Verified (default).*
14. Q-09-1: in G2, "answers as the quiz policy allows" means the reveal policy (G6, G7); instructors see answers only when the reveal policy allows it. *Reported.*
15. Q-P4-1: corrections are proposed by course staff or Organization Admins and approved by another Organization Admin of that organization; platform-course corrections by another Platform Admin; Platform Admins never act on organization-course content. *Reported.*
16. Q-P4-2: corrections may change course title, summary, lesson text, quiz prompts, options and explanations, never answer keys, settings or structure, within P4's limits (typo, formatting and broken-link fixes with an attestation; title and summary through the approver). *Reported.*
17. Q-P4-4: cloning copies the outline, lesson text and quizzes, not files. *Reported.*
18. Lesson text is plain text (paragraphs and automatically linked URLs); no HTML is rendered. *Reported.*

**Not decided by this entry:** these are decisions, not authorization to apply migrations, change hosted configuration or deploy. The Q-07-12 and Q-08-1 changes are prepared and tested in an isolated database first and presented for separate approval. Q-06-8 (the real Google identity data shape) and Q-06-9 (the migration owner reading `auth.identities`) are verification items, not rules.

## D39 — CM2 video: YouTube review workflow (owner decisions, 3 November 2026)

*Recorded 3 November 2026 from the owner's decisions at CM2 Prompt 1, after the CM2 decision brief (revision 2) and the CM2 video review design report (Claude Project: `claude/cm2-prompt1-decision-brief-2026-11-03.md`, `claude/cm2-video-review-design-report-2026-11-03.md`). Implementation specification: `docs/cm2-implementation-package.md`. These are decisions only: they authorise no migration, Edge Function deployment, configuration, secret, cleanup activation, deletion or channel access; each needs its own approval.*

**Confirmed (owner, 3 November 2026)**
1. **Video hosting.** Public courses (organisation-owned or platform) use the AQS-owned YouTube channel, with videos published as Unlisted after AQS review. Organisation-only courses keep private Supabase Storage video with 15-minute signed URLs (D20). No paid video provider is used (Mux, Cloudflare Stream and others are not adopted; `docs/video-provider-brief.md` is superseded). P16's boundary stands: Unlisted YouTube videos are not secure private content and are never used for organisation-only or sensitive material.
2. **Workflow.** Instructors submit lesson videos through AQS; AQS reviews them; only approved videos are uploaded, manually in YouTube Studio, to the AQS channel as Unlisted and then attached to the lesson. No YouTube credentials are stored by the platform. Course staff no longer attach YouTube IDs themselves.
3. **Two gates.** *Content review*: a Platform Admin who is not the submitter approves the submission for publication processing, requests changes (with a reason) or rejects it (with a reason). Approval at this gate does not permit publishing or attaching the video. *Publication verification*: after the upload to the AQS channel, a Platform Admin who is not the submitter verifies the channel, the Unlisted setting, embedding and the corrected captions before the video is attached. Technical verification and reviewer confirmation are recorded separately.
4. **Technical verification is not proof.** YouTube's oEmbed response is recorded as a technical check and may block an attachment (video not found, not embeddable, or a different channel), but it is not relied on as proof of AQS channel ownership until a real AQS test shows the returned information is sufficient, and it is never treated as proof that a video is Unlisted. The reviewer confirms visibility in YouTube Studio.
5. **Narrow exception to L11 P3.** Platform Admins may preview and download submitted videos, and their caption files, of public courses only, for review and publication; every access is audited. This gives no access to organisation-only course content.
6. **Captions (language-neutral).** Every video has synchronised captions in its spoken language. Where automatic captions are unavailable or unsuitable (for example Kinyarwanda), the instructor supplies a timed caption file (WebVTT or SRT), which is verified after upload. Course languages are not restricted.
7. **Captions on organisation-only videos.** Each stored video needs a timed caption file in a supported format (WebVTT or SRT; stored as WebVTT), made available to learners through the player. An approver of that organisation confirms that the captions are present and suitable after reviewing the timed captions in the context of the video; a checkbox alone is not sufficient. The confirmation (who, when, a note on what was checked, which files) is recorded; the system does not claim to prove the quality of that review. Because Platform Admins cannot see organisation-only content (L11 P3), this confirmation is made by an Organization Admin of that organisation who did not propose the course (P22).
8. **Retention principle.** One verified master of each published video (the exact reviewed file) is kept for recovery while its course remains published.
9. **Narrow exception to P5.** A removed or unavailable YouTube video in a published course may be replaced by an audited re-upload of the same previously reviewed master, re-verified at the publication gate. No other change to the published course is permitted by this exception.
10. **Requirements checklist.** The submission, content-review and publication-verification checklists in `docs/cm2-implementation-package.md` part 7 are approved as a starting point.
11. **Dependency.** `tus-js-client` for resumable uploads is approved in principle, subject to dependency review, compatibility checks and upload and resume testing.

**Deferred (not decided by this entry)**
- Retention periods and deletion rules for submitted, superseded, rejected and withdrawn files and for masters after a course is archived: they need the R4 legal review and a separate decision. Until then no submission, caption or master file is deleted and the orphaned-file cleanup stays inactive (0017 not activated).
- Whether YouTube's oEmbed lookup is reliable enough even as a blocking signal: established by the staging test with an AQS test video (CM2 Prompt 2). Until then a mismatch or a failed lookup blocks attachment; a match is never proof of ownership. If the lookup proves unreliable, it is recorded but no longer decides attachment, and the YouTube Studio reviewer confirmations remain required in every case.

**Effect on earlier entries:** D5, D20, P16 and D38 are unchanged and stand. Q-07-5's non-sensitive attestation is given by the submitter at submission; the AQS verifier attests at attachment. L11 P3 gains the exception in point 5; P5 gains the exception in point 9; Q-07-2 (Platform Admin approval of organisation courses from the outline) is unchanged, but captions on an organisation-only course must already be confirmed by an Organization Admin of that organisation (point 7). The text of earlier entries is unchanged.

## D40 — Organisation domain admission in the first release (owner decisions, 8 November 2026)

*Amends D34 P14.* The first release includes domain verification and automatic domain admission. Invitations remain available to everyone and stay the route for people who do not qualify. P14's text is kept as the historical record. The development page's "later release" label is removed when the feature is built.

- **Unchanged and binding:** D4 and D31 (DNS TXT verification; verification alone grants nothing; admission off until explicitly enabled; Learners only; turning admission off stops new admissions only; email-domain matching alone never grants course access); D33 identity rules; P10 and Q-08-4 (Organisation Admins assign courses); P12 and F4 (organisation status); T9 (audit).
- **Eligibility:** a signed-in person is admitted when `private.caller_verified_google_email()` (D33, 0015) returns a non-`gmail.com` address whose domain **exactly equals** a domain that is verified and admission-enabled for an **active** organisation.
- **Control:** Platform Admins add, verify, enable, disable and remove domains. Organisation Admins may view their own organisation's domains and pause or resume admission for a verified domain of their own organisation. They have no access to other organisations' domains. Pausing stops new admissions only; existing members keep their membership.
- **Identity rules:** D33 is unchanged. Organisations whose staff cannot meet it (no Google Workspace, or secondary Workspace domains) use invitations. The limitation is explained during onboarding.
- **Uniqueness:** a domain belongs to at most one organisation. Public email-provider domains are refused.
- **Effect of admission:** one active membership with the Learner role only. No enrolment. An existing membership is never changed. A **removed** membership is never reactivated by admission.
- **Status:** draft and suspended organisations admit no one.
- **Leavers:** removal is manual by Organisation Admins in the first release.
- **Audit:** every domain change, verification result, enable/disable and admission writes one row to `private.organization_audit`.
- **Not authorised by this entry:** migrations, Edge Function deployment, hosted configuration and staging changes; each needs its own approval.

*Effect on earlier entries:* P14 is superseded as above. D4, D31, D33, P10, P12, F4 and T9 are unchanged. T1: the domain migration takes the next free number after 0019. D31's open DNS-timeout item: no automatic expiry in the first release; verification is re-checked when admission is enabled.

## Amendment index

The older entries listed here keep their original text. This index records how later entries relate to them.

| Older entry | Related entry | Relationship |
|---|---|---|
| D2 | D12, D14 | Consistent: design references are preserved; D2's classification is unchanged. |
| D3 | D14 | Owner confirmed Option A on 23 October 2026 and accepted the labelled hero placeholder for Phase 2. Sourcing the photo is deferred. The landing design it refers to has since been updated. |
| D4, D6 | D18 | Refined in conversation: Organization Admins are appointed by invitation from Platform Admins, and staff invitations must be revocable. D4's opt-in domain admission and D6's exclusion of Instructor-sent invitations are unchanged. The reissue question is resolved by the 22 October 2026 owner confirmation, and the Accept invitation screen is deferred (23 October 2026). |
| D8 | D15 | Earlier proposal, not approved: email and password sign-in for Public Learners. Google-only is the current requirement (D15 status, 23 October 2026). D8's text is unchanged. C7 (Not linked) remains open and the screen is deferred (23 October 2026). |
| D10 | D13 | Reaffirmed in conversation. The installation note is out of date (see D13). |
| D11 | D15 | Limited explicit instruction: non-functional layouts for the approved Google-only authentication designs only. The "no stored passwords" interpretation is recorded in D15. |
| D11 | D15 (23 October 2026 entry) | Clarified 23 October 2026: explicit authorization for Google-only authentication implementation, superseding the earlier prohibition for that scope only. Email and password and other methods remain disabled. The earlier wording is unchanged. |
| D27 | D30 | Clarified 23 October 2026: the completion route and the Congratulations layout are provisionally approved for frontend implementation, excluding certificate features. Certificates on course completion remain not designed and deferred. The original D27 wording is unchanged. |
| A3 (provisional) | D13, D15 | **Proposed amendment note:** A3's "Google sign-in only" conflicts with D15's proposed email/password sign-in, and its naming of Firebase Authentication conflicts with D13 (no provider selected). A3's text is unchanged; it remains provisional and is not approved. |
| A2 | D16–D20, D27 | A2's text in D11 is unchanged. D27 approves a central minimal permission list for the development-build demo only. Still open: permissions for course sharing, preview approval, resource grants, and production authorization. Production invitation revocation is settled by D18-A (confirmed 23 October 2026). |
| A5 | D16, D22, D27 | A5's text in D11 is unchanged. D27 approves the revised fictional persona set for the demo. An Instructor persona for platform-owned courses stays excluded until that authoring question is decided. |
| A1, A4, A6 | D27 | Their text in D11 is unchanged. D27 approves them for the development-build demo only, with the route map in D27; A6 is unchanged in substance. Production routes and other unresolved production decisions are not settled by D27. On 23 October 2026, D27 also authorised `/request-demo` (development only). |
| D14 | D3 | The landing hero asset is deferred (23 October 2026). The 19 October sourcing sequence remains a proposal, not an approved requirement. |
| D24 | D3, D27 | The For Organizations destination is an open owner decision (23 October 2026). The link wording and behaviour are unchanged. |
| D28 | D29 | The Phase 1 commit reference was checked against Git history, and the record now says the acceptance record was updated after commit `4fcd953`. New Phase 2 entry D29 (method approved 23 October 2026; Phase 2 closure accepted by the owner on 23 October 2026). |
| D4, D15, D18 | D31 | Clarified 25 October 2026: domain verification and admission, invitation binding and reuse, and course access are confirmed in D31. D18's seven-day expiry is unchanged, and the 72-hour figure in an earlier summary is withdrawn. The text of D4, D15 and D18 is unchanged. |
| D4 | D34 | P14 defers domain verification and domain admission to a later release. D4's rules (no automatic membership; admission explicitly enabled; Learners only) apply unchanged when they are built. |
| D5 | D34 | P16: private Storage with refreshed 15-minute signed URLs; unlisted YouTube only for public, non-sensitive courses. The limitation (signed URLs control access but cannot prevent copying or recording) is recorded. D5's text is unchanged. |
| D6 | D32 | D6's "General Admins" are Organization Admins (D22). I3 adds Platform Admins as senders of Instructor and Learner invitations. D6's exclusion of Instructor-sent invitations is unchanged. |
| D7 | D32, D34 | L5 (D32) includes optional due dates on assigned courses, answering D7's "Required courses and due dates" row. P21 (D34) lists the features outside the first release and keeps them as visibly non-functional placeholders, shown clearly as "coming later" as D7 requires. P23 requires the landing-page certificate and messaging lines to be changed or marked "coming later" before production. D7's text is unchanged. |
| D8 | D34 | C7 is resolved by P13: ordinary sign-in always works (F1); the "not linked" page appears only through an organization sign-in link. D8's text is unchanged. |
| D13 | D25 | D13's open item (hosting, backend, database and authentication provider) is settled by D25 (Supabase and Render, 21 October 2026). D13's text is unchanged. |
| D15 | D26 | D26 records the Google-only first-release approval of 21 October 2026, from the architecture plan, Revision 2. D15's 22/23 October date conflict concerns later confirmations; it is not resolved and remains open. D15's text is unchanged. |
| D16 | D34 | P18: no course sharing in the first release. D16's open questions apply when sharing is designed. |
| D17 | D32, D34 | L11 (D32) settles routine and audited support access for Platform Admins, and excludes learning records. P19 (D34) settles aggregate figures: counts A1–A7 only. Still open: whether any exceptional ("break-glass") access to learning records will exist, and how it would be granted and recorded (architecture plan Q-C8). D17's text is unchanged. |
| D18 | D32, D33, D34 | D32 records I1–I3, C1, C2, G9 and the self-invitation safeguard. D33 records the Google identity policy behind D18's verified-email requirement. D34 (P15) narrows routine Platform Admin invitation visibility to pending Organization Admin invitations in any organization and invitations the Platform Admin sent, with an audited support lookup for anything else; this is planned for migration 0006, which is not yet written, applied or tested and is blocked until Google sign-in evidence exists and its tests have run. D18-A revocation is unchanged. |
| D19 | D32, D34 | D19's open items: which attempt counts, by P9 (any passing attempt passes; best score recorded); the default attempt limit, by D32 (three); the pass mark per quiz, by L6 (D32); historical attempts after edits, by P5 and P9 (published quizzes are frozen). D32 also records G5: retakes after passing are a per-quiz setting, off by default; "retakes are allowed while attempts remain" is unchanged. D19's text is unchanged. |
| D20 | D34 | D20's open items: the scope of an access grant, by P17 (no separate grants in the first release; enrolment gives access); video playback within the 15-minute limit, by P16 (the player requests fresh signed URLs). Signed URLs and the downloadable flag stay as written. D20's text is unchanged. |
| D22 | D32, D34 | Public Learner means a Learner with no organization membership (F1, D32). AQS Owner is a Platform Admin capability (P20, D34). D22's text is unchanged. |
| D24 | D34 | About and Contact exist as development-only pages (26 October 2026) and stay unavailable in production builds. P23 covers landing-page copy. D24's text is unchanged. |
| D27 | D25, D26, D32, D34 | The reserved IDs D25 and D26 are now used. From D27's "Provisional or open" list: instructor editing scope (Q5) is settled by P3; the L11 wording deferred to Priority 4 is recorded in D32; who authors platform-owned courses by P1; the publishing workflow by L2 (D32) and P22. Still open: which organization settings can be edited, and the undesigned suspended-organization, no-access and workspace-switching screens. Production rules in D32 and D34 (including L11 and P15) apply to production; D27's demo rules are unchanged for the development build. |
| A2 | D32, D34 | A2's text in D11 is unchanged. Of the items the A2 row above lists as still open: course sharing by P18; preview approval by P2; resource grants by P17; production authorization by D32 and D34 (F1–F8, L11, P1–P23). |
| A5 | D34 | P1 decides who authors platform-owned courses. Adding an Instructor persona for platform-owned courses to the demo needs its own approval; D27's persona set is unchanged. |
| D30 | D32, D34 | D30's open items: 1 by L6 (D32: every lesson is required, so no requirement setting) and P8; 2 by P8; 3 by P9; 4 by P5 (requirements cannot change after publication); 5 by L5 (D32: optional due dates on assigned courses, D7). Certificates stay deferred. D30's text is unchanged. |
| D31 | D32, D34 | D31's open list is settled by D32 and D34 (see D32, "Effect on D31's open list"). Domain verification and admission are deferred (P14); D31's rules apply when they are built. D31's text is unchanged. |
| Owner confirmations — 22 October 2026 | D33, D34 | "Invitation email verification": the mechanism is D33, planned for migration 0006 (not yet written, applied or tested; blocked until Google sign-in evidence exists and its tests have run). "Platform Admin invitation visibility": production visibility is settled by P15 (D34): pending Organization Admin invitations in any organization and invitations the Platform Admin sent, plus the audited support lookup. The 22 October wording is unchanged. |
| D18 | D36 | For staging only, D36 records the owner-approved procedure for the initial Platform Admin (D18-B's open note: "still to be written down") and the owner's report of the first grant on 27 October 2026. Production's procedure remains open. D18's text is unchanged. |
| D33, D34 (T1, P15), D35 | — | Status on 2 November 2026: migrations 0005a–0013 exist in the repository, pass the sandbox suite and were applied to staging (0012 and 0013 on 1 November 2026, reported in the A5 record). D33's and T1's "planned, not yet written" wording and D35's file facts describe 26 October 2026 and are kept unchanged. Real Google identity evidence on staging is recorded outside this file (A8). |
| D19, D20, D32, D34, D37 | D38 | D38 confirms the working defaults built into migrations 0006–0011 and their review answers (Q-06…Q-10, Q-P4, Q-P12-1), with two changes (Q-07-12, Q-08-1) to be implemented in M2 and M3. Earlier entries' text is unchanged. |
| D5, D20, D34 (P5, P16, L11 P3), D38 (Q-07-2, Q-07-5, #6) | D39 | Public-course video through the AQS-owned YouTube channel after two-gate AQS review; organisation-only video stays in private Storage with required, confirmed timed captions; narrow audited exceptions to L11 P3 (review of public-course submissions) and P5 (re-attaching the same reviewed master); retention periods deferred to R4. P16's boundary and D20 stand. Earlier entries' text is unchanged. |
| D34 (P14) | D40 | Superseded 8 November 2026: domain verification and automatic domain admission are in the first release under D4 and D31's rules. Organisation Admins view, pause and resume admission for their own verified domains; Platform Admins add, verify and remove domains. P14's text is unchanged as the historical record. |

### Owner confirmations — 22 October 2026

**Status:** Current owner confirmations made on 22 October 2026. These entries record the owner's current confirmations and do not claim to reproduce or independently verify historical approvals.

- **Hosting, backend, database and authentication:** Render is the approved hosting platform, confirmed by the owner as final and approved by all. Supabase is the intended database, backend and authentication direction. This records the current confirmation and does not rewrite D13's earlier statement that the Render comparison had not selected a provider. Deployment details not covered by these decisions remain open.
- **Authentication method:** Google-only authentication is the current requirement. This supersedes D15's proposed email-and-password option for Public Learners as the current policy. D15's historical wording is retained as a record of the earlier proposal.
- **Invitation email verification:** Retain D18's requirement that the accepting user has a verified email matching the invitation email. The implementation mechanism requires technical review.
- **Platform Admin invitation visibility:** For the development demo, use D27's narrow invitation-visibility scope. Production visibility remains a separate open decision.
- **Invitation revocation:** The permission scope remains open. D27's provisional demo rule must not be treated as the final production policy.
  - *Clarification (23 October 2026): The open revocation-scope question was resolved by D18-A, confirmed in conversation on 23 October 2026. The 22 October statement is retained as historical context.*
- **Invitation reissue:** Resolve D18's open reissue question by allowing reissue only through creation of a new invitation with a new token. Previously revoked or expired tokens remain invalid.

The identity of the recovery repository remains unknown under D12's preservation rule. No recovery candidate is authorized for modification.

The Claude Project mirror has not been inspected; its current contents remain unverified.
