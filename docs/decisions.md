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

**Recommendation: Option A** (`Landing [Ready].png`, frame 1). **Awaiting your confirmation before the landing page is built.**

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
- The landing hero choice. **D3 remains open and is not superseded**; it is reviewed with the landing assets.

## D15 — Authentication and invitation policy

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

**Open**
- Which administrators may revoke which invitations.
- Platform Admin provisioning: the procedure for creating Platform Admins, including whether any form of self-registration is allowed. No policy has been decided.
- Whether a revoked or expired invitation can be reissued.

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
- **Sign in** and **Get started** stay unavailable until sign-in is separately approved. This entry does not approve or implement authentication. D11, D13 and D15 still apply.

**Why:** unbuilt features must not appear to work (D7), public screens must work on mobile and desktop (D9), and authentication work is limited to the approved layouts (D11, D15).

**Implemented in:** commit `09139a4` on `phase-1-foundations` (public header and footer, and the About and Contact items on the landing and course-detail pages).

## Amendment index

The older entries listed here keep their original text. This index records how later entries relate to them.

| Older entry | Related entry | Relationship |
|---|---|---|
| D2 | D12, D14 | Consistent: design references are preserved; D2's classification is unchanged. |
| D3 | D14 | Remains open. The landing design it refers to has since been updated. |
| D4, D6 | D18 | Refined in conversation: Organization Admins are appointed by invitation from Platform Admins, and staff invitations must be revocable. D4's opt-in domain admission and D6's exclusion of Instructor-sent invitations are unchanged. |
| D8 | D15 | Proposed amendment: email and password sign-in for Public Learners. |
| D10 | D13 | Reaffirmed in conversation. The installation note is out of date (see D13). |
| D11 | D15 | Limited explicit instruction: non-functional layouts for the approved Google-only authentication designs only. The "no stored passwords" interpretation is recorded in D15. |
| A3 (provisional) | D13, D15 | **Proposed amendment note:** A3's "Google sign-in only" conflicts with D15's proposed email/password sign-in, and its naming of Firebase Authentication conflicts with D13 (no provider selected). A3's text is unchanged; it remains provisional and is not approved. |
| A2 (provisional) | D16–D20 | Open: will need permissions for course sharing, preview approval, inviting Organization Admins, revoking invitations and resource grants. |
| A5 (provisional) | D16, D22 | Open: may need an Instructor persona for platform-owned courses. |
| A1, A4, A6 (provisional) | — | Unchanged and still provisional. |
