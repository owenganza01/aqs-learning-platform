# Phase 3 closure record (Learner mock-data workflows): acceptance pending

**Status: ACCEPTED by the project owner, for the completed mock learner workflow only.** Acceptance is based on the final closeout evidence in section 6 and the owner's explicit approval.

**What acceptance covers:** the completed mock learner workflow described in sections 1 and 2, with every limitation, deferred item and open decision in sections 2 to 5 carried forward and unresolved unless stated otherwise.

**What acceptance does not authorise:** production learner routes, real authentication or OAuth, backend integration, database changes or migrations, persistence of progress, quiz grading, certificates, the completion route, or any other deferred feature. The learner, lesson, quiz and demo routes remain development-only. Migration `20261022210000_0005_preview_email_gate.sql` and the local database residue remain outside this acceptance (section 5).

**Scope (owner-approved 2026-10-23):** development-only learner workflows on mock data: the lesson player, a mock learning-service interface, lesson navigation, in-memory progress, and links between the learner dashboard, the course detail page and the lesson player. Frontend only.

**Out of scope, unchanged:** migrations, database and database tests, hosted services, authentication and OAuth, enrolment, quiz grading, persisted progress, certificates, browser storage, network persistence. Migration `20261022210000_0005_preview_email_gate.sql` and the local database residue were not touched by this phase. They remain documented risks from the Phase 3 assessment.

## 1. Completed work

| Item | Where | Notes |
|---|---|---|
| Lesson route `/learn/courses/:courseId/lessons/:lessonId` | `src/App.tsx`, gated by `import.meta.env.DEV` | Unknown course or lesson shows Not Found. |
| Lesson page | `src/pages/LessonPage.tsx`, `LessonPage.module.css` | Desktop: navy outline beside the lesson. Below 1024 px: the outline sits below the lesson behind a "Course content" toggle. |
| Mock learning-service interface | `src/dev/sample-learning-service.ts` | `getOutline`, `getLesson`, `getCourseProgress`. Synchronous, sample data only, no network, no writes. |
| Sample courses | `src/dev/sample-course.ts` | `sample-regression` (course detail) and `sample-data-analytics` (dashboard). One source for the player, the course detail and the dashboard. |
| In-memory progress | `src/dev/learner-progress.ts` | React memory only. Survives client-side navigation. A reload restores the sample starting state. |
| Dashboard progress | `src/pages/LearnerDashboardPage.tsx` | The featured course's card, and the offline and syncing Continue hero, read the in-memory progress in the same session. |
| Links into the player | `src/pages/CourseDetailPage.tsx` (non-quiz lessons); `src/pages/LearnerDashboardPage.tsx` (featured course Resume and Continue) | Each opens the next lesson of the course it belongs to. |
| Sample starting state | `SAMPLE_STARTING_DONE_LESSON_IDS` in `sample-course.ts` | Lessons 1–3 of the data analytics course are done. Three of seven, rounded down, is 42%, the approved dashboard figure. |
| Quiz sample | `QuizPage.tsx`, its CSS and `e2e/quiz-sample.spec.ts` | Unchanged from HEAD. No grading, scoring or saved attempts. |

**Verified behaviour (executed E2E, 94 of 94 passed):**

- Marking a lesson done updates the featured dashboard card in the same session: `e2e/learner-progress-dashboard.spec.ts` "marking a lesson done updates the dashboard in the same session".
- Continue and Resume open a lesson of the displayed course: the same file's "the featured card starts at the design figures and links to its next lesson" and "the Continue action from the offline state opens a lesson of the displayed course", plus `e2e/learner-dashboard-states.spec.ts` "default view keeps My learning, Recommended and New courses".
- A reload restores 42%: "a reload restores the sample starting progress, not zero".
- Completing the remaining lessons shows 100% and a disabled Review action: "completing every remaining lesson shows the course as completed on the dashboard".
- Progress is in memory, with no network writes or storage writes when the controls are used: `e2e/learner-lesson.spec.ts` "using the controls makes no requests and writes nothing to storage".

**Correction pass completed in this round:** the dashboard now updates in the same session; the Continue relationship is aligned with the mock data; the reset behaviour is tested; the lesson header uses the course category and title, as in the design; the lesson title sits below the video; progress is labelled "Your progress"; completed and current states are marked in the outline; attachments show the design's file names, types and sizes with disabled download controls; and the narrow-screen order puts the lesson first.

## 2. Known limitations (carry into acceptance)

- **Placeholder lesson titles.** Lessons 1–3 and 5–7 of "Data analytics fundamentals" are labelled "Placeholder lesson N". Their titles are not from any approved design. Only lesson 4, "Introduction to Regression" (18 min, video), and the course title come from the design.
- **Course and lesson naming.** The dashboard's featured course is "Data analytics fundamentals", and its Next lesson text is "Lesson 4 — Introduction to Regression · 18 min". Both come from the approved design, and both are kept as written. In the mock data, the lesson belongs to the data analytics course. A separate sample course, "Introduction to Regression" (`sample-regression`), has a lesson with the same title. The two courses share that title. This is not resolved (see section 4).
- **Lesson-count discrepancy: 10 versus 12.** The design's player reads "4 modules · 12 lessons" and "5 of 12 lessons completed". The player counts 10 playable lessons, because quiz rows are not lessons in the player. Progress percentages and counts therefore use 10 as the denominator. The design's 42% and 5-of-12 figures for the regression course cannot be reproduced without deciding whether quiz rows count (see section 4).
- **Progress start for the regression course.** The player shows 0% and "0 of 10 lessons marked as done" when opened. The design shows 42% and 5 of 12 completed. No approved sample data says which lessons are complete, so the regression course starts at zero.
- **Dashboard progress scope.** Only the featured course card and the offline and syncing Continue hero update. The other course cards and the stats row keep their fixed design figures. The completed state keeps its design figures.
- **Progress reset.** Reloading the page resets progress to the sample starting state. This is intentional and documented, not persistence.

## 3. Deferred work

- **Video artwork and playback.** The design shows a chart graphic and a "Play lesson · 18 min" control over the video. The implementation shows a labelled navy placeholder with no control. The artwork is video content, and no approved video content exists (D5, D7). The Play control would be a non-functional control, so it is omitted.
- **Mobile tabs.** The design shows Overview, Documents and Notes tabs on narrow screens. The implementation shows all sections in one column. Notes is deferred (D7). The tabs are not built.
- **Attachments downloads.** Attachment names, types and sizes match the design, but the download controls are disabled. No file exists, and downloads are deferred (D7, D20).
- **Notes tab** (D7).
- **Offline, loading and certificate frames** of the Course Player board. The offline and syncing states exist only on the dashboard, as labelled mock states (D7).
- **Completion route** `/learn/courses/:courseId/complete`. Not built (see section 4).
- **Quiz grading, scoring, persisted attempts and certificates.** Not built (D19).

## 4. Decisions requiring the owner's approval

These are open. None has been resolved, approved or guessed in this record.

1. **Relationship between "Data analytics fundamentals" and "Introduction to Regression."** Keep the mock structure as it is, or change the design text, or change the mock data, or record a different relationship.
2. **Whether quiz rows count toward the lesson count and the progress denominator.** The design counts 12 lessons, and the player counts 10 playable lessons.
3. **Completion route and certificate frame.** The Course Player board's fourth frame is a "Congratulations" certificate screen. D27 lists certificates on course completion as not designed. The route is not built, and the dashboard's existing Completed state is the only completion display.
   *Clarification (23 October 2026): the completion route and the Congratulations layout are provisionally approved for frontend implementation, excluding certificate features, under D30 in `docs/decisions.md`. Certificate implementation remains deferred. This clarification does not change the acceptance recorded above.*
4. **Player design status.** The board is marked "Needs review". Whether it is cleared for acceptance is an owner decision.
5. **Disabled dashboard course cards.** The other course cards remain disabled. Whether they should open the player, and with what content, is undecided.
6. **Mobile sticky footer.** The implementation adds a sticky footer with Mark as done, Previous lesson and Next lesson, which covers about 140 px on narrow screens. The design frame shows no such footer. Whether to keep it is undecided.
7. **Placeholder lesson titles.** Whether the placeholders stay for the demo, or are replaced with approved content, is undecided.
8. **Acceptance itself.** Recorded as accepted by the project owner for the completed mock learner workflow (see the status line). Items 1–7 above remain open and unresolved.

## 5. Backend and security limitations (unchanged, not Phase 3 work)

- No backend integration exists in the application. All learner data is sample data.
- No authentication, OAuth, sessions or access checks exist for learner routes. The routes are development-only, and their access rules are not security controls (D21).
- Migration `20261022210000_0005_preview_email_gate.sql` is untracked in `supabase/migrations/`. Its header still says "NOT APPLIED", and D18 review section 12 records it as applied locally. Its status is unresolved. This phase did not change it.
- The local database holds test residue from earlier runs. Reset is not authorised. This phase ran no database tests.
- Google sign-in evidence is not yet collected (D18).
- Enrolment, persisted progress, grading and certificates have no backend.
- No production configuration exists for these routes. They are gated out of production builds.

## 6. Verification (final source state, 2026-10-23)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b` | Exit 0 |
| Lint | `npm run lint` | Exit 0 |
| Production build | `npm run build` | Exit 0 |
| Full Playwright E2E | `npx playwright test` | **94 of 94 passed** |
| Production route boundary | `vite preview` on port 4173, headless browser | Only `/` renders. `/learn`, `/learn?state=offline`, both lesson routes, the quiz sample, `/courses/sample-regression`, `/request-demo`, `/design-system`, `/sign-in` and `/sign-up` all show "We couldn't find that page". |
| Dev-only strings in `dist/` | `grep -rl` over the build output | Zero matches for: "Sample lesson: layout only", "Video playback is not available", "Your progress", "lessons marked as done", "Placeholder lesson", "sample-data-analytics", "Bring AQS E-Learning to your organization", "Submitting this form is not available yet", "Sample Org A", "Loading lesson" |
| Responsive overflow | Headless browser, `scrollWidth` against `clientWidth`, at 390, 768, 1024, 1280 and 1440 px | No overflow on the lesson (regression), lesson (data analytics), course detail, dashboard default, dashboard offline or quiz sample pages. 30 of 30 checks passed. |

No check failed, so no correction was made in this closeout. Database-mutating tests were not run. No migration was applied and no hosted service was touched.

**Visual comparison (from the previous round):** the desktop and mobile lesson-player composites in `<scratchpad>\compare5\` compare the implementation with the original Course Player frames (1x board, top 900 px for desktop and top 844 px for mobile only). The differing-pixel figures (31.96% desktop, 32.66% mobile) are not acceptance criteria. The differences that matter are the items in sections 2 and 3, reviewed individually.

## 7. Summary for the owner

- **Ready for acceptance review:** the functional mock workflow, the dashboard linkage, the reset behaviour, the route gating, and the verification above.
- **Accept only with the limitations in section 2 recorded**, and with a decision on each item in section 4.
- **Accepted by the project owner** for the completed mock learner workflow, with the limitations, deferred work and open decisions above carried forward.
