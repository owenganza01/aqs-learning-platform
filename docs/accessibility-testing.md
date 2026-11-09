# Accessibility testing (I5, D1, D9)

How the AQS Learning Platform is checked for accessibility, and what still needs a person.

## Automated checks (run in CI)

`@axe-core/playwright` 4.10.2 (dev dependency, pinned) runs axe-core's WCAG 2.0, 2.1 and 2.2 level A and AA rules
(`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) inside the existing Playwright suites, so CI runs them
through its existing `npm run test:e2e` and `npm run test:e2e:live` steps. No workflow change is needed.

| Spec | What it scans | Widths |
|---|---|---|
| `e2e/accessibility.spec.ts` | 33 design-preview routes: public pages, sign-in, learner, instructor, organization admin, Platform Admin, access denied, not found | 1440 px, 390 px |
| `e2e-live/live-accessibility.spec.ts` | 25 live screens against the mocked Supabase API (synthetic data): public, signed-in learner/instructor/org admin, Platform Admin | 1440 px, 390 px |

Each test fails on **any** axe violation (it lists the rule and the first elements) and on horizontal page scroll.
Run locally with `npx playwright test e2e/accessibility.spec.ts` or `npx playwright test -c playwright.live.config.ts live-accessibility`.

When a new screen or route is added, add it to the matching list. When a check fails, fix the page; do not
disable a rule without recording the reason as a decision.

## What automated checks cannot cover (manual, before each release)

Axe finds roughly a third to a half of accessibility problems. These are checked by hand:

1. **Screen reader pass** (NVDA on Windows or VoiceOver on macOS/iOS): sign-in, accepting an invitation, the learner
   dashboard, a lesson, a quiz attempt and its result, the course builder, members and invitations. Check that
   headings, landmarks, form labels, error messages and status updates (saved, submitted, failed) are announced.
2. **Keyboard only**: every journey above without a mouse; visible focus at every stop (D1); dialogs and the mobile
   drawer keep focus inside and return it on close; no keyboard trap.
3. **Tablet width (768 px)** and **200 % / 400 % zoom**: no lost content or controls, no horizontal page scroll.
4. **Content**: link and button text makes sense out of context; images that carry meaning have text alternatives;
   uploaded course videos have captions where the course needs them (owner/instructor responsibility).
5. **Reduced motion and high-contrast modes** do not hide content.

Record the date, tester, browser/screen reader and findings in the release notes. Status at the M5 release-readiness
assessment (3 November 2026): automated checks 0 violations on all 116 page/width combinations (local, mocked data);
the manual screen-reader pass and 768 px checks have **not** been done yet.
