# Phase 2 closure record (accepted 23 October 2026)

**Status: Phase 2 accepted by the project owner on 23 October 2026**, as recorded in `docs/decisions.md` (D29), subject to the documentation-only changes made with that acceptance. The owner accepted Claude's post-correction visual review and recommendation. ChatGPT did not independently inspect the five PNG comparisons. Nothing in this record approves a design match, a deferral or a destination beyond what D3, D8, D15, D18, D24, D27 and D29 already state. Two items remain unresolved and non-blocking: the For Organizations destination (D24) and the D15 approval-date discrepancy.

**Scope:** public and development-build screens listed in D29. Routes are development-only unless stated.

## 1. Evidence (last run after the visual corrections; not rerun for acceptance)

| Check | Result |
|---|---|
| Typecheck (`npx tsc -b`) | Exit 0 |
| Lint (`npm run lint`) | Exit 0 |
| Production build (`npm run build`) | Exit 0 |
| Full Playwright E2E (`npx playwright test`) | **77 of 77 passed** (70 existing, 6 in `e2e/request-demo.spec.ts`, 1 new mobile-heading test in `e2e/sign-in-route.spec.ts`) |
| Landing E2E (`e2e/landing-page.spec.ts`, from commit `75bd024`) | 8 of 8 passed (included in the 77) |
| Production route boundary (`vite preview`, headless browser) | `/` renders. `/request-demo`, `/design-system`, `/sign-in`, `/sign-in/error`, `/sign-up`, `/courses/sample-regression` and `/learn` show "We couldn't find that page". |
| Production bundle strings | Zero matches in `dist/` for: "Bring AQS E-Learning to your organization", "Submitting this form is not available yet", "request-demo", "Sample Org A", "sample-regression", "Alex Sample", "Welcome back", "Loading sign-up", "Loading quiz" |
| Overflow (`scrollWidth > clientWidth`) at 390, 768, 1024, 1280, 1440 px | No overflow on any of the six screens at any of the five widths (30 captures, re-run after the corrections) |

## 2. Screens in scope

| Screen | Route | Availability | Notes |
|---|---|---|---|
| Landing | `/` | Production | One page from frame 1 (Option A). Hero photo is a labelled placeholder (D3). |
| Course detail | `/courses/:courseId` | Development only (D27) | Sample data notice shown. Enroll disabled with "(not available yet)" (D8, D11, D15). |
| Sign in | `/sign-in` | Development only (D27) | Inert Google control. Demo notice (required by D27). "Welcome" on desktop, "Welcome back" on narrow screens. |
| Sign-in error | `/sign-in/error` | Development only (D27) | "Try again" inert. "Contact support" disabled and announced "(not available yet)". "Back to sign in" link only (D27 exception). Demo notice (required by D27). |
| Sign up | `/sign-up` | Development only (D27) | Inert "Sign up with Google". Demo notice (required by D27). |
| Request a demo | `/request-demo` | Development only (D27, authorised 23 October 2026) | Visual-only form. Submit disabled and labelled "not available yet". No request, storage, organization or access. No navigation entry point. |

## 3. Visual verification

**Method (D29, approved):** full-page captures from the development build, with `animations: 'disabled'`, `reducedMotion: 'no-preference'`, a 900 px viewport height and `document.fonts.ready`. Inter loads from Google Fonts, so the run had network access.

**Valid references only:**

- `design-reference/new designs/2 Screens/Auth [Ready].png` (2× updated board; Auth is a changed screen under D14). Frames 1, 2 and 4 are desktop; frame 3 is the mobile sign-in. Downscaled 2→1.
- `design-reference/new designs/2 Screens/Landing [Ready].png` (2× updated board; Landing is a changed screen under D14). Frame 1 downscaled 2→1. Hero placeholder area masked for the metric only (660, 201, 540 × 596 px).
- `design-reference/2 Screens/Learner courses & quizzes [Needs review].png` (1× original; unchanged screen under D14). Frame 1, top 900 px. The design is marked "Needs review".
- `design-reference/2 Screens/Admin [Pending backend].png` (1× original; unchanged screen under D14). Frame 3, top 1384 px.

**Metric:** a pixel differs if any channel differs by more than 40. The figure is the share of compared pixels that differ. These figures are not design matches. They show the remaining difference, and they are not an acceptance criterion.

| Screen | Width | Reference | Compared area | Differing (before → after corrections) | Mean abs. diff (after) | Owner review |
|---|---|---|---|---|---|---|
| Sign in | 1440 | Auth [Ready] frame 1 | 1440 × 900 | 16.70% → 16.70% | 22.6 | Accepted (owner, 23 Oct 2026) |
| Sign-in error | 1440 | Auth [Ready] frame 2 | 1440 × 900 | 16.80% → 16.81% | 23.4 | Accepted (owner, 23 Oct 2026) |
| Sign up | 1440 | Auth [Ready] frame 4 | 1440 × 900 | 16.98% → 17.03% | 23.4 | Accepted (owner, 23 Oct 2026) |
| Sign in | 390 | Auth [Ready] mobile frame 3 | 390 × 844 | 7.10% → 7.41% | 13.4 | Accepted (owner, 23 Oct 2026) |
| Landing | 1440 | Landing [Ready] frame 1 (hero masked) | 1440 × 900 | 4.98% → 4.98% (unchanged) | 8.7 | Accepted (owner, 23 Oct 2026) |
| Course detail | 1440 | Learner courses frame 1 | 1440 × 900 | 21.20% → 21.20% (unchanged) | 44.0 | Accepted (owner, 23 Oct 2026) |
| Request a demo | 1440 | Admin [Pending backend] frame 3 | 1440 × 1384 | 6.34% → 6.34% (unchanged) | 11.7 | Accepted (owner, 23 Oct 2026) |

The mobile and error figures moved slightly. The numbers do not capture the wrapping and footer changes, which were checked by eye. The sign-in error and sign-up figures rose a little because the first line of text is now wider, which matches the reference more closely.

**Composites** (reference left, page right; magenta divider) are in `<scratchpad>\compare2\`. Captures are in `<scratchpad>\shots2\`. Neither folder is inside the repository, and nothing is written to `design-reference/`. Baselines are not committed (D29).

**Visual review (accepted 23 October 2026):** the owner accepted Claude's post-correction visual review and recommendation for these comparisons. This is not an independent inspection by ChatGPT. The five PNG files are the comparison images, and they are not committed to the repository.

**Widths with no applicable reference:** 768, 1024 and 1280 px have no design frame for any in-scope screen. At 390 px, only sign in has a mobile reference. For every other case, the results are layout and overflow only (section 1), not design matches.

## 4. Visual corrections applied (23 October 2026)

| # | Owner request | What changed | Status |
|---|---|---|---|
| 1 | 390 px sign-in: "Welcome back" | `SignInPage.tsx` has two heading spans; CSS shows "Welcome back" below 900 px (AuthLayout's stacking breakpoint). Desktop keeps "Welcome". The accessible name is one heading at each width. New E2E test covers 390 px. | Done. |
| 2 | Heading wrapping, error and sign-up at 1440 px | Mock-auth heading tracking changed locally from -0.02em to -0.03em (`MockAuth.module.css`). "We couldn't sign you" now fits on the first line, and "in" wraps, as in the reference. Sign-up already wraps as in the reference. | Done. |
| 3 | Footer-link styling | Footer rows use the caption size, with a dot separator between items (`MockAuth.module.css`, `SignInPage.module.css`). "Learn about teaching." stays dimmed (D24). The reference shows it in orange, which would not be a dimmed unavailable item. | Done, with that difference kept. |
| 4 | Contact support | Disabled button with a visually hidden "(not available yet)" label. Not focusable, not a link, not activatable. E2E test checks it is disabled. | Done. |
| 5 | Remove demo notices where redundant | **Not removed.** D27 states that a visible demo-only notice appears on all three routes (sign-in, sign-in error, sign-up). That is an approved requirement, and the notices explain the mock behaviour. They stay. | Kept, see section 6. |
| 6 | Course-detail hero navy | The reference hero navy samples at `#1E3A5F` at several points. That is exactly the shared `--color-navy` token already used by the page. No change was made, so no shared token or other screen was touched. The remaining visual difference is the sample-data banner above the hero and the placeholder image. | No change needed. |

**Explicitly preserved (accepted limitations, unchanged):** the landing hero photo placeholder; the landing's darker orange controls (D1 contrast); no Google continuation button on the landing; the landing background network stays subtle and is covered by the global reduced-motion rule; the course-detail image placeholder; Enroll unavailable with its "(not available yet)" label; request-demo development-only, visual-only, with submission disabled and no storage, organization or access.

## 5. Limitations (carry into closure)

- Hero photo: labelled placeholder. The original photo is not exported as its own asset (D3, D14). No substitute image is used.
- Partner logos and course thumbnails: placeholders. Landing statistics and footer contact details are existing placeholders.
- Course, dashboard and auth content is sample data, development only (D27). The course-detail image is a placeholder.
- Google sign-in, sign-up and "Try again" are inert. No authentication, sessions, tokens or provider calls exist (D15, D27).
- Request-a-demo submission is unavailable. The form sends nothing, stores nothing and creates no organization (D27).
- Enroll is disabled (D8, D11, D15). Quiz grading on the server is not implemented (D19).
- Unavailable navigation items follow D24, shown dimmed. The For Organizations destination is an open owner decision (D24).
- Date conflict: D15's status (23 October 2026) and the 22 October owner-confirmations block both record Google-only. The approval date is unresolved (D15).

## 6. Remaining visual differences (accepted as documented, 23 October 2026)

- Photo panels on sign in, sign-in error and sign-up are placeholders, not the design's photo (D3, D27).
- The narrow-screen sign-in reference has no photo panel, so a mobile photo comparison is not possible.
- The demo notices on sign in, sign-in error and sign-up add a box the design does not show. D27 requires them.
- The "Request a demo" button is grey, not orange, because it is disabled (D27).
- The "Learn about teaching." footer link is dimmed, not orange, because it is an unavailable item (D24).
- The sign-in error "Contact support" button is grey, because it is disabled.
- The course-detail sample-data banner sits above the hero, and the image is a placeholder.
- The landing background network differs from the reference in node placement and line direction. It is subtle and respects reduced motion.

## 7. Deferred functionality

- **Accept invitation:** designed (`3 Pending & Archive/Auth/Accept invitation/Desktop.png`). Implementation is deferred until the D18 decisions (revocation scope, Platform Admin provisioning) and the email-matching mechanism are settled, and until the backend exists (D18, D15).
- **Not linked:** designed (`3 Pending & Archive/Auth/Not linked/Desktop.png`). Implementation is deferred pending the C7 owner decision (D8, D15).
- Real authentication and OAuth, enrolment, quiz grading, sessions, tokens, database work, migrations, and the separate Windows PostgreSQL service: all out of Phase 2.
- Production routes beyond `/` and Not Found: none authorised.

## 8. Owner decisions (status)

1. Visual review of the five corrected comparisons: accepted by the owner on 23 October 2026, as Claude's post-correction review and recommendation.
2. This closure record and D29: accepted by the owner on 23 October 2026, subject to the documentation-only changes made with that acceptance.
3. **Unresolved, non-blocking:** the For Organizations destination (D24). Not decided. No destination has been invented.
4. **Unresolved, non-blocking:** the D15 approval date. The 23 October status line and the 22 October owner-confirmations block conflict. Neither has been changed.
5. Screenshot baselines remain outside the repository for now (D29). Storing them in the repository is a separate future decision.
6. No navigation entry point for `/request-demo`. None is authorised, and none was added.
