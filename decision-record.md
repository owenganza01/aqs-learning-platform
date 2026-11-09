# AQS Learning Platform — Decision Record

*Status: **provisional**, approved 13 October 2026. Source: design audit `AQS-design-audit.md` (repo root) and the Project document `design/design-audit-2026-10-13.md`.*

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

- **React Router** for navigation (installed: `react-router` 8.4.0, which requires Node.js **22.22 or newer**).
- **CSS Modules + CSS custom properties** for styling. No CSS framework.
- Keep the existing React + TypeScript + Vite project.
- No backend, database, authentication provider or UI framework in this phase.
- Inter is loaded from Google Fonts in `index.html` (no extra package). Self-hosting is an easy swap later if needed for privacy or offline development.

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
