# AQS Learning Platform — Design Audit (read-only)

*Audit date: 13 October 2026 · Scope: `AQS-New-Platform/design-reference/` and `AQS-New-Platform/aqs-platform/` · No files were modified.*

---

## 1. Files and screens actually inspected

**Access.** Read access was granted to `design-reference/` and `aqs-platform/` on your computer. Copies of the images were taken for viewing; the originals were not touched. `backups/` was not opened (not needed).

**What's in `design-reference/`** — 22 PNGs, 1 contact sheet, 1 ZIP. The ZIP (`AQS E-Learning figma designs.zip`, 45 entries) was listed and matches the folders **file-for-file**, so it holds nothing extra.

Several files in `2 Screens/` are **boards containing several frames side by side**. I split them into individual frames and inspected each one. In total: **40 frames** — 34 desktop (1440 px wide) and 6 mobile (≈390 px wide).

| File | Frames inside | Viewed |
|---|---|---|
| `1 Cover & Foundations/Design system.png` | 1 long page | ✅ all |
| `2 Screens/Landing [Ready].png` | 2 desktop (identical except hero image crop) | ✅ all |
| `2 Screens/Auth [Ready].png` | 2 desktop + 1 mobile | ✅ all |
| `2 Screens/Learner dashboard [Ready].png` | 6 desktop states | ✅ all |
| `2 Screens/Learner courses & quizzes [Needs review].png` | 4 desktop | ✅ all |
| `2 Screens/Course player [Needs review].png` | 4 desktop + 3 mobile | ✅ all |
| `2 Screens/Instructor [Pending backend].png` | 2 desktop | ✅ all |
| `2 Screens/Admin [Pending backend].png` | 3 desktop | ✅ all |
| `2 Screens/Admin/Organization detail/Desktop.png` | 1 | ✅ |
| `2 Screens/Admin/Users and roles/Desktop.png` | 1 | ✅ |
| `3 Pending & Archive/**/Desktop.png` | 12 single screens | ✅ all |

**What's in `aqs-platform/`** — the untouched Vite starter: React 19, TypeScript 6, Vite 8, ESLint; `src/` contains only `App.tsx`, `main.tsx`, two CSS files and starter assets; one Git commit ("Initial commit"). No router, no components, no styling system yet. Nothing to preserve beyond the Vite setup itself.

**Limits of this audit.** These are flat images, so I could not read Figma layer names, component definitions, auto-layout rules or exact font files. Colours were verified by **sampling pixels**; sizes by **measuring pixels**. Anything I could not measure is marked as an assumption.

---

## 2. Screen inventory and status

**Status key:** *Ready* / *Needs review* / *Pending backend* / *Archived* / *Unable to verify*. "Existing" = the tag in your filename. "Recommended" = my suggestion, with a reason when it differs.

### A. Public (visitor)

| # | Screen | Source | Existing | Recommended | Notes |
|---|---|---|---|---|---|
| P1 | Landing page (hero option A) | `Landing [Ready]` frame 1 | Ready | **Ready** | Layout ready. Content still placeholder (see §6). |
| P2 | Landing page (hero option B) | `Landing [Ready]` frame 2 | Ready | **Ready – pick one** | Only the hero photo crop differs. Choose A or B. |
| P3 | Public course detail ("Introduction to Regression", Enroll) | `Learner courses & quizzes` frame 1 | Needs review | **Needs review** | Uses the public top nav, so it belongs to the public group, not the learner group. |
| P4 | "Bring AQS E-Learning to your organization" (Request a demo form) | `Admin [Pending backend]` frame 3 | Pending backend | **Ready (move to Public)** | Public marketing page filed under Admin. Frontend is complete; only the form submission needs a backend. |

### B. Authentication

| # | Screen | Source | Existing | Recommended | Notes |
|---|---|---|---|---|---|
| A1 | Sign in — "Welcome back" (desktop) | `Auth [Ready]` frame 1 | Ready | **Ready** | Google-only sign-in. |
| A2 | Sign-in error — "We couldn't sign you in" | `Auth [Ready]` frame 2 | Ready | **Ready** | |
| A3 | Sign in (mobile, 392 px) | `Auth [Ready]` frame 3 | Ready | **Ready** | One of only two screens with a mobile design. |
| A4 | Accept invitation — "You've been invited to join ABC Corporation" | `3 Pending & Archive/Auth/Accept invitation` | *(folder only)* | **Pending backend** | No newer version exists; same visual style as A1. Looks current, not archived. |
| A5 | Not linked — "Your email isn't linked to an organization" | `3 Pending & Archive/Auth/Not linked` | *(folder only)* | **Needs review** | Conflicts with A1's copy (see §6, C7). |

### C. Learner

| # | Screen | Source | Existing | Recommended | Notes |
|---|---|---|---|---|---|
| L1 | Dashboard — in progress (default) | `Learner dashboard [Ready]` f1 | Ready | **Ready** | Sidebar layout. |
| L2 | Dashboard — new learner / empty | f2 | Ready | **Ready** | Good empty state. |
| L3 | Dashboard — course completed | f3 | Ready | **Ready** | |
| L4 | Dashboard — loading skeleton | f4 | Ready | **Ready** | |
| L5 | Dashboard — offline banner | f5 | Ready | **Ready (visual) / scope decision** | Offline sync is a large engineering feature (§6). |
| L6 | Dashboard — syncing banner | f6 | Ready | **Ready (visual) / scope decision** | Same. |
| L7 | Quiz — question in progress | `Learner courses & quizzes` f2 | Needs review | **Needs review** | |
| L8 | Quiz result — Passed (85%) | f3 | Needs review | **Needs review** | Scoring rule needs defining (§6). |
| L9 | Quiz result — Not passed, attempts remaining | f4 | Needs review | **Needs review** | |
| L10 | Course player — video lesson (desktop) | `Course player` f1 | Needs review | **Needs review** | |
| L11 | Course player — offline / video needs connection | f2 | Needs review | **Needs review** | Shows "Available offline" lessons. |
| L12 | Course player — loading skeleton | f3 | Needs review | **Needs review** | |
| L13 | Course complete — certificate ready | f4 | Needs review | **Needs review** | Certificate shows no learner name and no verification ID (§6, C6). |
| L14 | Course player — mobile | f5 | Needs review | **Needs review** | Has a "Notes" tab that desktop does not. |
| L15 | Course player — mobile, outline sheet open | f6 | Needs review | **Needs review** | |
| L16 | Course player — mobile, offline | f7 | Needs review | **Needs review** | |
| L17 | Learner Home (top-nav version, "Assigned to you", due dates) | `3 Pending & Archive/Learner/Home` | *(folder only)* | **Archived** — superseded by L1 | But it holds concepts L1 dropped: org badge, required courses, due dates, overdue (§6, C10). |
| L18 | Course player (older version) | `3 Pending & Archive/Learner/Course player` | *(folder only)* | **Archived** — superseded by L10 | Has "Message your instructor" link not in L10. |
| L19 | Knowledge check (older version, "Save and exit") | `3 Pending & Archive/Learner/Quiz` | *(folder only)* | **Archived** — superseded by L7 | "Save and exit" is not in L7. Decide whether to keep it. |

### D. Instructor (= "Course Creator" in project roles)

| # | Screen | Source | Existing | Recommended | Notes |
|---|---|---|---|---|---|
| I1 | Course builder + lesson editor | `Instructor [Pending backend]` f1 | Pending backend | **Pending backend + security review** | Video = "unlisted YouTube link" (§6, C5). |
| I2 | Quiz builder | f2 | Pending backend | **Pending backend** | |
| I3 | Instructor dashboard | `3 Pending & Archive/Instructor/Dashboard` | *(folder only)* | **Pending backend** | Same sidebar as I1; no newer version. |
| I4 | Course › Certificate tab | `3 Pending & Archive/Instructor/Course certificate` | *(folder only)* | **Needs review** | Template upload + "visible for N months". Verification not shown. |
| I5 | Messages | `3 Pending & Archive/Instructor/Messages` | *(folder only)* | **Pending backend** | |

### E. Administrators

The designs contain **two different admin workspaces**: a platform-wide one and an organization-scoped one. They map cleanly to your project's *Global Admin* and *General Admin* roles.

| # | Screen | Source | Existing | Recommended | Notes |
|---|---|---|---|---|---|
| G1 | Global Admin › Organizations list | `Admin [Pending backend]` f1 | Pending backend | **Pending backend** | Footnote says domains "connect users automatically" (§6, C1). |
| G2 | Global Admin › Create organization | f2 | Pending backend | **Needs review** | Three conflicts with the tenant rules (§6, C1–C3). |
| G3 | Global Admin › Organization detail (Instructors tab) | `2 Screens/Admin/Organization detail` | *(no tag)* | **Unable to verify → suggest Pending backend** | No status in filename. |
| G4 | Global Admin › Users and roles (role change) | `2 Screens/Admin/Users and roles` | *(no tag)* | **Unable to verify → suggest Needs review** | One role per user (§6, C4). |
| O1 | General Admin › Dashboard | `3 Pending & Archive/General Admin/Dashboard` | *(folder only)* | **Pending backend** | |
| O2 | General Admin › Invitations and domains | `…/Invitations and domains` | *(folder only)* | **Pending backend** | **The best-aligned screen with your security rules.** |
| O3 | General Admin › Members | `…/Members` | *(folder only)* | **Pending backend** | Supports multiple roles per person (correct). |
| O4 | General Admin › Organization settings | `…/Organization settings` | *(folder only)* | **Pending backend** | |

**Classification note.** `3 Pending & Archive/` mixes both categories and nothing in the filenames separates them. My split above (Learner Home / Course player / Quiz = archived; everything else = pending) is an **inference** from which screens have newer replacements. Please confirm (Decision D2).

---

## 3. Verified design system

### Verified from the images

| Token | Value | How verified |
|---|---|---|
| Navy | `#1E3A5F` | Swatch + sampled from page header and every sidebar |
| Blue | `#2563EB` | Swatch + sampled from progress bars and links |
| Orange | `#F97316` | Swatch + sampled from primary buttons in 4 screens |
| Background / canvas | `#F8FAFC` | Swatch + sampled page backgrounds |
| Text | `#0F172A` | Swatch + sampled |
| White / surface | `#FFFFFF` | Swatch |
| Typeface | Inter | Stated on design system page; letterforms match Inter visually. Font file not verifiable from a PNG. |
| Type scale | H1 56/60 700 · H2 40/46 700 · H3 24/31 600 · Body 16/25 400 · Caption 14/20 500 | Stated on design system page |
| Spacing | 8 px base: 8 · 16 · 24 · 32 · 48 · 64 | Stated |
| Radius | 12 px for cards, buttons, inputs, panels | Stated; visually consistent across screens (not pixel-measured on every element) |
| Button height | **48 px** in the app | Measured: dashboard "Continue", quiz "Next", design-system buttons = 48 px |
| Elevation | Shadow 01: `0 2px 8px 0` navy @ 8% (cards, controls). Shadow 02: `0 12px 32px -4px` navy @ 15% (menus, dialogs) | Stated |
| Button variants | Primary (orange fill) · Secondary (blue outline) · Text (blue link + arrow) — default / hover / disabled | Shown |
| Rule | "One dominant (orange) action per view" | Stated |

**The preliminary summary you were given is correct on every value.**

### Used in screens but not documented (need adding as tokens)

| Use | Sampled colour | Where |
|---|---|---|
| Sidebar active item / help card | `#2C4D75` | All sidebars |
| Info / syncing / selected fill | `#EFF6FF` | Sync banner, secondary hover, selected quiz option |
| Warning fill (offline) | `#FFF7ED` (dashboard) **and** `#FEF3C7` (player) | Two different offline colours: inconsistent |
| Success green | (text and badges) | "Completed", "Verified", "Available offline", quiz pass icon |
| Danger red | red family (exact value not measurable from anti-aliased text) | "Revoke", "Deactivate", "Overdue" |
| Violet badge | `#F5F3FF` fill | "General Admin" role badge |
| Disabled fill | `#CBD5E1` | Disabled primary button |
| Secondary text grey | ≈`#64748B` (sampled ≈`#6D7C92` with anti-aliasing) | Descriptions everywhere |

These values match Tailwind's default slate / blue / orange / amber / violet palette. That helps with naming the tokens, but it doesn't require using Tailwind.

### Inconsistencies found

1. **Primary hover = default.** The design system's "hover" orange is pixel-identical to "default", so no hover state is actually designed.
2. **Two secondary-button styles.** The design system specifies blue outline + blue text. Auth, quiz and course-certificate screens use **grey outline + navy text** ("Try again", "Previous", "Review answers", "Cancel"). Recommend formalising this as a *Neutral* variant.
3. **Landing buttons are 52 px tall**, not 48 px (measured "Get started" and "Browse courses"). The app screens are 48 px.
4. **Search icon** renders as a hollow circle in 7 frames (learner dashboard states 2–6, org detail, users and roles) but as a magnifier elsewhere. This is probably an export glitch, so use the magnifier.
5. **Brand name.** The design system page footer says **"Northstar Learning"**, not AQS. The product uses a text-only "AQS / E-LEARNING" wordmark. The older learner Home uses "AQS E-Learning" in one line. There's no logo file.
6. **Icons.** The style looks like a 1.5–2 px outline icon set (consistent with Lucide). This can't be confirmed from PNGs.

### Accessibility and contrast (calculated with WCAG 2.x)

| Pair | Ratio | Result |
|---|---|---|
| White text on orange `#F97316` (every primary button) | **2.80 : 1** | ❌ Fails AA for normal (4.5) **and** large (3.0) text |
| Orange text on white (e.g. "View all courses", "Learn about teaching", "FEATURED COURSES" eyebrows) | **2.80 / 2.68 : 1** | ❌ Fails |
| Dark text `#0F172A` on orange `#F97316` | 6.37 : 1 | ✅ Pass |
| White on orange-600 `#EA580C` | 3.56 : 1 | ⚠️ Large text only |
| White on orange-700 `#C2410C` | 5.18 : 1 | ✅ Pass |
| Blue `#2563EB` on white | 5.17 : 1 | ✅ |
| Navy on white / white on navy | 11.5 : 1 | ✅ |
| Text `#0F172A` on canvas | 17.1 : 1 | ✅ |
| Grey secondary text (≈`#64748B`) on canvas | ≈4.5 : 1 | ⚠️ Borderline. Don't go any lighter for small text. |

Also missing from the designs: **keyboard focus states** (none drawn anywhere), labels for icon-only buttons (bell, sidebar collapse, video controls), and caption files to back the "CC" button.

### Responsive coverage

Mobile is designed **only** for sign-in (A3) and the course player (L14–16). There are no tablet frames, and nothing for mobile landing, dashboards, quiz, instructor or admin screens.

---

## 4. User roles and navigation

| Brief's role | Project role(s) | Designed? |
|---|---|---|
| Public visitor | Public Learner (before sign-in) | Yes |
| Learner | Student/Learner + Public Learner (after sign-in) | Yes, one shared design |
| Instructor | Course Creator | Yes |
| Administrator | **Global Admin** *and* **General Admin** — two separate workspaces in the designs | Yes (both) |
| — | AQS Owner | **No screens** |

### Public visitor
**Top nav:** Courses · For Organizations · About · Contact · Sign in · Get started.
**Pages designed:** Landing, Public course detail, Request-a-demo, Sign in (+ error, mobile).
**Journeys:** Landing → Browse courses → course detail → Enroll → sign in. Landing → For Organizations → Request a demo.
**Gaps:** no public **Catalog / Courses list** page (the nav item and "View all courses" lead nowhere designed); no About or Contact page; "Get started" has no destination designed (sign-in?); what happens after "Enroll" (sign-in → enrolled → player?) isn't shown.

### Learner
**Sidebar:** Dashboard · My courses · Catalog · Certificates · Messages · Profile · Help center · Sign out. **Header:** search, notifications, profile menu.
**Pages designed:** Dashboard (6 states), Course player (desktop + mobile states), Quiz (question / pass / fail), Course completion.
**Journeys:** Dashboard → Continue → player → quiz → result → next lesson → completion → certificate. These are well covered.
**Gaps:** **My courses, Catalog, Certificates (list), Messages, Profile, Notifications and Search results** have no designs. The learner can't see which **organization** they're in (the archived Home showed an "ABC Corporation" badge; the Ready dashboard doesn't). There's no workspace switcher for a learner in two organizations or in public + org. The Ready dashboard has no "required / due date / overdue" concept, but the General Admin dashboard reports on overdue required courses.

### Instructor
**Sidebar:** Dashboard · Courses · Learners · Invitations · Reports · Messages · Profile. **Header:** org name + "Instructor workspace".
**Pages designed:** Dashboard, Course builder, Quiz builder, Course › Certificate tab, Messages.
**Gaps:** **Courses list, Learners, Invitations, Reports, Profile** pages; the course **Settings** tab, which is where *visibility and enrollment rules* would live and is critical for public vs private courses; course **Learners** tab; Publish confirmation / review step; reading-lesson editor; "Create course" first step.
**Unclear permission:** instructors can "Invite learners" (dashboard card) and have an Invitations page. Your project rules give invitations to General Admins. Decide whether instructors may invite (Decision D6).

### Global Admin (AQS)
**Sidebar:** Overview · Organizations · Users and roles · Courses · Reports · Settings.
**Pages designed:** Organizations list, Create organization, Organization detail (Instructors tab), Users and roles.
**Gaps:** Overview, Courses, Reports, Settings; Org detail's Users / Courses / Settings tabs; assigning **General Admins** to an organization (the create form assigns *instructors* instead).

### General Admin (organization)
**Sidebar:** Dashboard · Members · Invitations · Courses · Reports · Messages · Organization settings.
**Pages designed:** Dashboard, Members, Invitations and domains, Organization settings.
**Gaps:** Courses, Reports, Messages pages; "Change roles" dialog; Deactivate confirmation.

### Cross-cutting gaps
- **No role/workspace switcher.** In O3, Mary Jones is both *Instructor* and *General Admin* at ABC, which is correct per your requirements, but no design shows how she moves between the two workspaces. (A different "Mary Jones, mary@aqs.com" is also the Global Admin. The sample data reuses the name, which makes screens confusing to compare.)
- **Post-sign-in routing:** nothing shows where each role lands after Google sign-in.
- **Permission-denied / 404 / organization-suspended** states are not designed.

---

## 5. Recommended reusable React components

### Supported directly by the designs

| Group | Components |
|---|---|
| **Layout** | `PublicLayout` (top nav + footer) · `AppShell` (navy sidebar + header + content) with role-specific nav config · `FocusLayout` (back link + title + progress, used by player and quiz) · `AuthLayout` (card left, navy illustration right) · `PageHeader` (title, subtitle, primary action) · `Breadcrumbs` · `Tabs` |
| **Sidebar parts** | `SidebarNav` / `SidebarNavItem` · `HelpCard` · `SignOutLink` · `Wordmark` |
| **Header parts** | `SearchField` · `NotificationButton` · `UserMenu` (avatar initials + name + role) · `OrgContext` ("ABC Corporation · Instructor workspace") |
| **Actions** | `Button` (primary / secondary / neutral / text / danger; 48 px; loading, disabled) · `IconButton` · `GoogleSignInButton` |
| **Forms** | `TextField` · `TextArea` · `Select` · `Toggle` · `RadioCard` (quiz option) · `FileDropzone` + `UploadedFileRow` · `EmailListInput` |
| **Data display** | `Card` · `StatCard` · `Badge` / `StatusPill` (Active, Draft, Published, Invited, Overdue, Verified…) · `RoleBadge` · `Avatar` (initials) · `DataTable` (+ pagination, row menu) · `ProgressBar` (with label) · `EmptyState` · `Skeleton` |
| **Course** | `CourseCard` (catalog variant + my-courses variant) · `ContinueLearningCard` · `CourseOutline` (modules/lessons, status icons, collapsible; also as mobile bottom sheet) · `LessonHeader` · `VideoPlayer` frame · `AttachmentCard` · `LessonFooterBar` (Mark as done / Next lesson) |
| **Quiz** | `QuizQuestion` · `QuizResult` (pass/fail) · `QuizBuilderQuestion` |
| **Feedback** | `Banner` (offline / syncing / info) · `InlineConfirm` (users-and-roles style) · `DropdownMenu` |
| **Messaging** | `ConversationList` · `MessageThread` · `MessageComposer` |
| **Certificate** | `CertificatePreview` |

### Recommended additions (not in the designs)
- `FocusRing` styles applied globally, plus a visible **focus state** on every interactive component.
- `Dialog` / `ConfirmDialog` (destructive actions, publish). Only an inline confirm exists today.
- `Toast` for "Saved", "Invitation sent", and so on.
- `ErrorState` and `PermissionDenied` / `NotFound` pages.
- `WorkspaceSwitcher` inside `UserMenu`.
- `MobileNavDrawer` for the sidebar under ~1024 px.
- `VisuallyHidden` for icon-button labels.

---

## 6. Missing information and risks

### Conflicts with confirmed project requirements (need your decision)

| # | Screen | Conflict | Suggested resolution |
|---|---|---|---|
| **C1** | G1, G2 | "Users with this email domain **join automatically**". Your rules say domain matching alone must not grant access. | Reuse the O2 pattern: domain must be **DNS-verified**, admission is an **opt-in toggle**, and people join **as Learner only**. Remove the auto-join copy from G1/G2. |
| **C2** | G2 | Status toggle defaults to **Active** at creation. Your onboarding flow needs a **draft / setup** state. | Add statuses Draft → Active → Suspended; create in Draft. |
| **C3** | G2 | Global Admin assigns **initial instructors**. Your flow: Global Admin assigns **General Admins**, who invite Course Creators. | Rename the section "Initial administrators". |
| **C4** | G4 | One **Role** and one **Organization** per user; role list lacks General Admin. Your rules require multiple roles across multiple orgs. O3 already shows multiple roles correctly. | Rework G4 to show a user's memberships (org + roles per row), matching O3. |
| **C5** | I1 | Video lessons via **"unlisted YouTube link"**. Unlisted ≠ private: anyone with the link can watch, and it can be shared outside the organization. | Decide whether this is acceptable for MVP (public/non-sensitive content only) or whether private org videos need a host with signed URLs. This affects cost and the stack. |
| **C6** | L13, I4 | Learner's certificate shows **no learner name and no verification ID**; neither screen shows how a third party verifies a certificate. Your rules require verifiable identifiers. | Add a certificate ID + public verification page (a missing screen). Also clarify how an uploaded PDF/PNG template becomes a personalised certificate. |
| **C7** | A1 vs A5 | A1 says "Signing in with Google **creates your learner account**" (open sign-up). A5 says "Your email **isn't linked** to an organization" (closed). | Probably both are right in different contexts: public sign-up always works, and A5 appears only when someone enters through an organization's sign-in link. Needs your confirmation. |
| **C8** | I3 | Instructors invite learners ("Invite people outside your company domain"). Your rules put invitations under General Admin. | Decide (D6). |
| **C9** | L5, L6, L11, L16 | **Offline mode and "Available offline" downloads.** Real offline video and background sync are a large, costly feature. | MVP: show the offline/syncing banners and graceful errors only; defer downloads. |
| **C10** | L1 vs O1, L17 | General Admin tracks **required courses, due dates, overdue**; the Ready learner dashboard has no such concept (the archived one did). | Decide whether required/due-date assignments are in the MVP. If yes, the learner dashboard needs a section for them. |

### Ambiguities in the designs
- **Quiz scoring:** 85% isn't possible on 10 one-point questions; the builder shows 1 point per question. Define the scoring rule.
- **Desktop vs mobile player:** mobile has a **Notes** tab (learner notes = new feature?); desktop has "About this lesson" instead; the older player had "Message your instructor".
- **"Save and exit"** on quizzes exists only in the archived quiz.
- **Ratings (★ 4.8)** on recommended course cards; there's no ratings feature in the requirements.
- **Catalog visibility:** public catalog vs organization catalog vs a learner's "Catalog" sidebar item. Which courses does each show?
- "Introduction to Regression" is a **lesson** on the dashboard but a **course** in the player and quiz. That's a sample-data mix-up, but routes need consistent naming.

### Placeholder content to replace before launch (not blockers for building)
Landing stats (6 learners, 1 country…), "Thumbnail placeholder" course cards, "Partner 1–3", footer email `@aqslearning.com` (incomplete), phone `+250 888 888 888`, typo "courses,teams", empty white box on the auth illustration panel, "Northstar Learning" in the design system footer.

### Delivery risks
- **Contrast failures** on every primary button and orange link. Fixing them changes the brand look slightly, so this is better decided before components are built.
- **Missing pages behind existing nav items** (20+). Each one is either a design gap or a build-from-pattern decision.
- **Desktop-only coverage** for most screens.

---

## 7. Prioritised implementation plan

The proposed sequence works. I'd make three adjustments:

1. **Phase 0 (new): decide before building.** Resolve the decisions below, especially contrast (D1) and the admin security conflicts (C1–C4). Fixing these after components exist means rework.
2. **Admin before instructor.** In the real onboarding flow, organizations and General Admins exist before courses do. Both can be built with mock data, but having admin screens first gives later screens real organizations to show. Optional.
3. **Group by layout, not only by role.** Build `PublicLayout`, `AuthLayout`, `AppShell` and `FocusLayout` once, early. Every screen sits on one of these four.

| Phase | Scope | Builds from | Needs backend? | Done when |
|---|---|---|---|---|
| **0 Decisions** | Approve list below; optionally update Figma for contrast & conflicts | — | No | Decisions recorded in the project |
| **1 Foundations** | Design tokens (CSS variables), global styles, Inter, focus ring; components: Button, form fields, Card, Badge, Avatar, ProgressBar, Skeleton, EmptyState, Banner, Table, Tabs; the four layouts; a `/design-system` preview page | Design system page + measured values | No | Preview page matches `Design system.png` side by side |
| **2 Public + Auth** | Landing (P1/P2), Public course detail (P3), Request a demo (P4), Sign in + error + mobile (A1–A3), Accept invitation (A4), Not linked (A5 after C7) | Ready screens | Form submit + Google sign-in later | Pixel comparison vs PNGs at 1440 px; usable at mobile width |
| **3 Learner** | Dashboard 6 states, player desktop + mobile, quiz + results, completion | Ready + Needs-review screens | Uses **clearly labelled mock data** | All states reachable via a mock-state switch |
| **4 Admin** | General Admin O1–O4, Global Admin G1–G4 (with C1–C4 fixes) | Pending screens | Mock data | Matches designs; security copy corrected |
| **5 Instructor** | Dashboard, course builder, quiz builder, certificate tab, messages | Pending screens | Mock data | Same |
| **6 Validate** | Responsive pass, keyboard + screen-reader pass, contrast check, nav consistency, missing-page placeholders | — | No | Checklist complete |

"Pending backend" screens are all buildable now as frontend with mock data. Only the wiring waits.

**Dependencies within the constraints.** Building multiple pages will need a **router** (React Router is the usual choice). That's a library, not a backend or framework, but it's a new dependency, so it's on the approval list. For styling, I'd use **plain CSS custom properties + CSS Modules**, which are built into Vite and need no new dependency.

---

## 8. Recommended next action

Approve (or adjust) the decisions below. Then start **Phase 1**: create the design-token file and the core components, plus a `/design-system` preview page inside the existing `aqs-platform` Vite app. Check that page side-by-side against `Design system.png` before any real screen is built. It's small, low-risk, and every later screen depends on it.

---

## Decisions that need your approval before implementation

1. **D1 — Orange contrast.** Pick one: (a) darker orange `#C2410C` behind white text, (b) keep `#F97316` with dark navy text, or (c) keep as-is and accept the accessibility failure. *Recommended: (a) for buttons, plus a darker orange or navy for orange text links.*
2. **D2 — Pending vs archived.** Confirm that Learner Home / Course player / Quiz in `3 Pending & Archive/` are **archived** and everything else there is **pending**.
3. **D3 — Landing hero.** Option A or B (frames differ only in the photo crop).
4. **D4 — Admin security fixes (C1–C4).** Confirm the General Admin "domain admission" pattern replaces "auto-join", organizations start in Draft, and Global Admins assign General Admins.
5. **D5 — Video hosting for private courses (C5).** Unlisted YouTube for MVP, or private hosting from the start?
6. **D6 — Who can invite learners:** General Admins only, or Instructors too?
7. **D7 — MVP scope:** offline downloads (C9), required courses with due dates (C10), learner notes, ratings, quiz "save and exit". In or out?
8. **D8 — Sign-up rule (C7):** confirm public Google sign-up is always allowed and "Not linked" applies only to organization entry links.
9. **D9 — Responsive target:** mobile for public + learner screens; desktop-first (usable on tablet) for instructor and admin. Agree?
10. **D10 — New dependencies:** React Router for page routing; CSS Modules + CSS variables for styling (no new styling framework).
