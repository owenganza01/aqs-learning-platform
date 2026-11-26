# WS-CHARTS — session 23 November 2026

Working copy `/home/claude/ws-charts` (from `integration` at `5be29c6`). Nothing committed, pushed or deployed;
no migration, no database, no hosted setting touched. All results below are **repository / local browser
evidence** (preview against the Vite dev server; live mode against the mocked Supabase API).

## 1. A2 / C4 — chart library (tasks 7-2 reopened, 7-3 to 7-6)

### Library comparison (measured in this codebase)

Both prototypes drew the same horizontal bar chart (labels, value on each bar, tooltip, tokens, reduced
motion), lazy-loaded behind the same `BarChart` shell, built with `npm run build` (Vite 8). Sizes are
Vite's reported raw / gzip.

| | Recharts 3.11.0 (chosen) | Chart.js 4.6.1 + react-chartjs-2 5.3.1 |
| --- | --- | --- |
| React 19 | peer `react ^16.8 … ^19`; works with React 19.2.8 here | peer `react … ^19` (wrapper); works |
| Rendering | SVG: labels and values are real text (zoom-crisp, testable, CSS-styled, forced-colours friendly) | canvas: pixels only; nothing for assistive tech or tests to read |
| Screen-reader story | plot `aria-hidden`, table alternative carries the numbers (same as before); Recharts' keyboard layer switched off so nothing focusable sits in a hidden region | same table needed; canvas adds nothing |
| Token theming | CSS classes on SVG elements (`fill: var(--color-action)` etc.), no colours in code | colours must be read with `getComputedStyle` and passed as strings; no live update |
| Label wrapping | own wrap (`wrapLabel`) into `<tspan>` lines; labels above bars below 440 px | manual array-of-lines labels; no measured wrapping |
| Values on bars | drawn in the bar shape (custom) | needs a plugin (custom or `chartjs-plugin-datalabels`, another dependency) |
| Reduced motion | `isAnimationActive` per chart | `animation: false` |
| Lazy chunk (the library + plot) (Vite's printed column; see REVIEW-FIXES.md finding 6 for the reconciled, file-based figures) | **398.7 kB / 114.0 kB gzip** | **152.8 kB / 53.4 kB gzip** |
| Initial bundle (both lazy) | index 256.5 + shared 10.1 + ui 58.4 = 325.0 kB (gzip 104.5 kB) vs 324.2 kB (103.8 kB) before: **+0.8 kB** | same (+0.8 kB) |
| Maintenance | MIT; last release 17 Nov 2026 | chart.js MIT, 22 Oct 2026; react-chartjs-2 last release 27 Oct 2025 |

Decision: **Recharts**. Chart.js is ~60 kB gzip lighter, but only in the lazily loaded chunk that admin
and instructor dashboards fetch; the initial bundle is the same for both. SVG text, CSS-token theming,
testability and no extra plugin outweigh that. Lazy loading is material: without it the 114 kB gzip
would load on every page (verified by an e2e test: the landing page requests no chart code; `/admin` does).
Note: the shared 10 kB chunk Rollup names `chart-model-*.js` is React's core moved out of `ui-*.js` (it is
not chart code; `ui` shrank by the same amount).

### What was built
- `src/components/ui/Chart/BarChart.tsx` — same props API (`title, description, data, unit, max,
  labelHeading, valueHeading, loading, emptyMessage`), every caller unchanged. Keeps "Show as table" /
  "Show as chart", the always-present table alternative, loading skeleton (`role="status"`), empty
  message, percent/count units. Plot lazy-loaded with `React.lazy` + `Suspense` (skeleton fallback).
- `src/components/ui/Chart/BarChartPlot.tsx` (new) + `BarChartPlot.module.css` (new) — Recharts vertical
  layout bar chart: token colours (bar `--color-action` 6.7:1, track `--color-surface-muted`, values
  `--color-text` / white inside long bars), wrapped labels (beside the bar ≥ 440 px plot width, above it
  on phones), every value printed on/after its bar, minimum 3 px sliver for small non-zero values, hover
  tooltip (label + "Heading: value", token card), grows once on first draw (no re-animation on resize),
  no animation with reduced motion, ResizeObserver-driven width (1440/768/390 checked).
  Labels and values are drawn in the background/bar shapes, not `LabelList`: in Recharts 3.11 `LabelList`
  disappears permanently when animation is switched off after mount (found and fixed during testing).
- `src/components/ui/Chart/chart-model.ts` — kept `scaleBars`/`formatValue`/`barPercent`; added
  `wrapLabel`, `chartLayout` (stacking, label column, row height, minimum right-hand room so a value past
  a short bar is never cut).
- `BarChart.module.css` — old SVG/list styles removed (plot styles moved to the new module).
- `src/live/summary-charts.ts` — unchanged (not needed). Live dashboards unchanged (same API).
- Dependency added: `recharts@^3.11.0` (`package.json`, `package-lock.json`); 0 vulnerabilities reported.

## 2. A8 (Part 7) — sign-up / sign-in options

Audit result:
- Live `/sign-in`, `/sign-up`: options come from `VITE_AUTH_PROVIDERS`; Google always; `render.yaml` sets
  no value, so production/staging show **Google only** (email/Apple/Facebook stay off until P7/CFI-8,
  docs/auth-providers.md, D42). Every live option is wired (OAuth authorize with PKCE + callback; email
  forms submit to Auth). Invitations stay Google-only (D33). Live get-started, request-workspace, landing
  CTAs all route to existing live pages.
- Fixed: **dev preview `/sign-in`, `/sign-up`**: the provider buttons were enabled-looking controls that did
  nothing. They are now disabled and named "Continue with … (not available yet)", like the preview's email
  form (`src/pages/auth/AuthOptions.tsx`; live pages always pass a handler, so they are unaffected).
- Fixed: **dev preview `/sign-in/error`**: inert "Try again" is now disabled + "(not available yet)"
  (`src/pages/SignInErrorPage.tsx`); "Back to sign in" remains the working path.
- Fixed: landing "Invited by your organization? Sign in with the email address…" now says "with the Google
  account for the email address…" (invitations accept Google only; matches /get-started).
- Not changed: design-system mock frames (labelled "Mock content"), preview invitation page (its Google
  button shows "Google sign-in is not connected in this preview").
- New live e2e (mocked): `A8: every entry point reaches sign-in, and every option shown on sign-in and
  sign-up starts its own flow` (e2e-live/live-auth-methods.spec.ts). Google-only deployment is covered by
  the existing live-phase-a test (passed).

## 3. A14 (Part 10.3) — realistic, consistent sample data (dev preview only)
- The placeholder org "Sample organization" / "ABC Corporation" is now one fictional company,
  **Northgate Logistics** (domain `northgate-sample.test`, tile "NL"), across org-admin, instructor,
  platform admin, platform users, catalog, course detail, invitation, profile and design-system previews.
  URL slugs (`sample-org`, `sample-abc`) unchanged.
- Org members' addresses moved from `@sample.test` to `@northgate-sample.test` (now also caught by the
  production-build sample-data check).
- The preview learner "Ganza Owen" (resembles a real person's name) is now "Aline Mukamana", an existing
  Northgate learner; instructor activity/messages/learners use Northgate learners (Claire Uwera, Denis
  Kayitare, Olive Nyiraneza, Eric Mugisha) instead of people from other sample orgs.
- Platform admin: Northgate has 20 learners, 3 published courses, instructors Mary Jones and Daniel Kim
  (as in the org preview); other orgs' contacts no longer reuse Northgate people (Joseph Okello, Thomas
  Mwangi, Peter Ndlovu). Platform users: Northgate org admin Grace Uwase, instructor Daniel Kim.
- Instructor courses: enrolments 18/14/11 (fit a 20-learner org; completion 78/65/74 unchanged).
- Chart sample data (`src/dev/sample-chart-data.ts`) now matches: the three published courses with the
  same completion rates, overdue 2/3/1, invitations 21/1/1/1, organizations 4 active / 0 draft / 1
  suspended, totals 2,072 learners / 26 published (sums of the five orgs) / 4 draft.
- Design system: "Course A/B/C" → "Fire safety refresher", "Manual handling basics", "Fleet driver induction";
  chart section note mentions Recharts.
- Still sample-marked (SAMPLE notes untouched); live data layer, seeds and staging data untouched.
- Known remaining inconsistency: platform users still list David Miller as a Northgate instructor (kept
  because several tests key on him); `src/content/public-site.sample.ts` not reviewed.

## Files
Added: `src/components/ui/Chart/BarChartPlot.tsx`, `src/components/ui/Chart/BarChartPlot.module.css`,
this report.
Changed: `package.json`, `package-lock.json`, `src/components/ui/Chart/{BarChart.tsx,BarChart.module.css,chart-model.ts}`,
`src/pages/auth/AuthOptions.tsx`, `src/pages/SignInErrorPage.tsx`, `src/pages/LandingPage.tsx`,
`src/dev/{sample-chart-data,sample-instructor-service,sample-org-admin-service,sample-platform-admin-service,sample-platform-users-service,sample-public-catalog,role-preview}.ts`,
`src/dev/design-system/DesignSystemPage.tsx`, `src/lib/navigation.ts` (preview shell org name + a comment),
`src/pages/{CourseCompletionPage,CourseDetailPage,InstructorSectionPages,InvitePage,LearnerDashboardPage,LearnerMessagesPage,LearnerProfilePage,LessonPage,MyCoursesPage,QuizPage}.tsx`,
`tests/unit/chart-model.test.mjs`, `e2e/{chart-previews,sign-in-route,mock-auth-screens,landing-page,added-pages,course-detail-page,design-pages,learner-catalog-my-courses,org-admin-pages,platform-admin-pages,platform-users-pages,visual-corrections}.spec.ts`,
`e2e-live/live-auth-methods.spec.ts`.
Shared hotspots: `package.json` — dependency line only (no script changes). `src/components/ui/index.ts` untouched.

## Changed assertions
- chart-previews: "All zero" measures each drawn bar's length (`getBBox().width === 0`) instead of the old
  `width="0%"` attribute, and also checks the drawn values read 0.
- chart-previews: values read from drawn value text (`[data-chart-value]`) instead of every `<text>` of the
  old SVG; added: drawn labels equal the table's row headings.
- chart-previews: cut-off check measures drawn labels/values inside the figure (old list rows are gone);
  added: no label overlaps its bar.
- chart-previews reduced motion: kept the `getAnimations()` check, added a bar-length stability check
  (Recharts animates in script).
- sign-in-route / mock-auth-screens: preview provider options and "Try again" are disabled and named
  "(not available yet)"; clicks are forced and still prove no request/navigation/storage; keyboard tests
  now assert focus never lands on them (it reaches "Create an account" / "Sign in").
- landing-page: invited-sign-in text includes "the Google account for".
- Sample-string updates (org name, domain, people): added-pages (conversation with Claire Uwera),
  platform-users (Daniel Kim instead of Sarah Chen), platform-admin (search "daniel"), design-pages,
  course-detail-page, learner-catalog-my-courses, org-admin-pages, visual-corrections ("78%" scoped to
  the Course performance region because the chart table now also holds 78% for the same course).

## New tests
Unit (chart-model): 6 (wrapping, unbreakable words, empty label, stacking, row height, value room).
e2e preview: tooltip + hidden-plot/no-focusable test; lazy-load test (no chart code on `/`).
e2e live: A8 entry points and every shown option starts its flow.

## Tests run (exact counts)
- `npm run lint`: 0 problems. `npm run build`: ok. `npm run check:build`: passed (102 files).
- `npm run test:unit`: 76/76 pass (70 before + 6 new).
- Preview e2e (Chrome, private port 5480): full suite run in three parts because one run exceeds the
  10-minute tool limit: part A (specs `accessibility` … `landing-page`) 259 run, 255 passed, 4 failed
  (sample-data/test strings; fixed and re-run: pass); part B 111/111; part C 117 run, 114 passed, 3 failed
  (2 sample strings fixed; `request-workspace` focus test passed on re-run, unrelated flake); final
  re-runs: failed tests + design-pages + added-pages 42/42, and `accessibility`, `chart-previews`,
  `course-detail-page`, `landing-page` 116/116. `chart-previews` alone also 21/21 twice.
  Not one uninterrupted single run of the whole preview suite (tool time limit).
- Live e2e (mocked API, private port 5481): live-dashboard-charts + live-platform-overview-layout +
  live-platform-control-center 60/60; live-auth-methods + live-sign-in-errors 22/22; live-accessibility +
  live-phase-a + live-auth-methods 112/112. Full live suite not run.
- Not run (not touched): `test:db`, `test:functions`, `check:functions`.

## Owner operations
None. (No migration, secret, deploy or hosted change. Turning on email/Apple/Facebook remains the
documented procedure in docs/auth-providers.md.)

## Risks / remaining
- Recharts adds 114 kB gzip to dashboard pages (lazy); acceptable, but Chart.js would be ~60 kB smaller.
- Recharts 3.x quirk worked around (labels not via `LabelList`); a future Recharts upgrade should re-run
  chart-previews.
- David Miller sample inconsistency; `public-site.sample.ts` not reviewed.
- Playwright default ports 5180/5181/5182 collide when workstreams run in parallel; I used private configs
  under /tmp (not in the repo).
