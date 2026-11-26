# Proposed copy and terminology changes (A12)

WS-RESEARCH, 23 November 2026. Source: the integration copy at `5be29c6`, read only. These are proposals for a frontend worker to apply. Nothing has been changed.

## Rules for whoever applies this

- **Approved decisions only.** Every edit is limited to the approved decisions: C1 (the current UI is the baseline, so these are wording edits, not redesigns), C3 (no new role names), D22 (canonical role terms), P21 and D24 (unbuilt features stay visibly unavailable), and the cleared-claims list in `src/content/public-site.ts`. No new claim about capabilities, security or price is added.
- **Legal text is not touched.** The Terms of Use, Privacy Policy and Cookie Policy (`src/content/legal/**`, rendered by `src/pages/legal/LegalPage.tsx`) and the sign-in notice `SIGN_IN_NOTICE` in `src/content/public-site.ts` are owner-supplied legal wording. Do not make any spelling or terminology change to them, even where they disagree with the UI.
- **Spelling (T1 and T2).** The proposal standardises the UI on "organization", "enroll" and "enrollment". That is the dominant spelling in the UI (about 650 against 40 occurrences) and matches the D22 role name "Organization Admin". **This is an owner choice.** If the owner prefers British spelling, do not apply group B; reverse it across the whole UI in one pass instead.
- **Tests.** When an edit changes text that a test asserts, update the assertion to the new text and list it under "changed assertions". The affected specs are named per row.
- **Files other workstreams are changing.** Apply edits there only after those workstreams merge, or hand the edit to them. They are marked **[after WS-ONBOARD]**, **[after WS-CHARTS]** or **[after WS-CERT]**.

---

## A. Positioning: AQS is a training workspace, not a course seller (T4, T5)

| ID | File (line) | Current text | Proposed text | Reason | Tests to update |
|---|---|---|---|---|---|
| C-1 | `src/pages/LandingPage.tsx` (218) | `Browse sample course catalog` | `Browse courses` | Production has no sample catalogue, so the label promises something that does not exist (journey F1). | none found |
| C-2 | `src/live/pages/learner/LiveLearnerDashboard.tsx` (107) | `Recommended for you` | `More courses open to you` | Nothing is personalised. The list is simply the other courses this person may join. | none found (check the `e2e-live` dashboard specs) |
| C-3 | same file (108) | `Explore more practical skills from the AQS catalog.` | `Public courses and courses from your organizations.` | Avoids presenting an "AQS catalog" for sale and says where the courses come from. | none found |
| C-4 | same file (109) | `Explore catalog` | `Browse courses` | Same as C-3, and consistent with the empty-state button. | none found |
| C-5 | same file (128) | `Discover something new. Choose a course from the catalog to start building your skills.` | `Courses your organization assigns to you appear here. You can also join an open course.` | Staff whose organisation has not assigned anything yet should learn that assignment is how training arrives (journey F7). The title "Start your first course" stays. | none for the description; the title is asserted in `e2e/learner-dashboard-states.spec.ts` and `e2e-live/live-learner*.spec.ts` and stays unchanged |
| C-6 | `src/live/pages/learner/LiveMyCourses.tsx` (151) | `Choose a course from the catalog to start building your skills.` | `Courses your organization assigns to you appear here. You can also join an open course.` | Same as C-5. | none found |
| C-7 | `src/pages/SignInPage.tsx` (86) | `Sign in to continue your courses and pick up right where you left off.` | `Sign in to your training and your organization's workspace.` | Admins and instructors sign in here too (journey F5). | check `e2e/mock-auth-screens.spec.ts` and `e2e/sign-in-route.spec.ts` before applying; none found by text search |
| C-8 | `src/lib/navigation.ts` (104), learner menu item | `Catalog` | `Courses` | Matches the page title "Courses" and the public header "Courses" (N6). It stays separate from "My courses". **Optional:** if the owner finds "Courses" next to "My courses" ambiguous, use `Browse courses` instead. | `e2e/learner-drawer.spec.ts`, `e2e-live/live-journeys.spec.ts`, `e2e-live/live-menus.spec.ts` |

**Not proposed, owner decision only:**
- `LandingPage.tsx` (41) `Build the skills that move your career forward.` This is approved Concept C landing copy, and `e2e/landing-page.spec.ts` asserts it. If the owner wants the heading to address both audiences, one option is "Courses for your team and for you." The owner must approve that; do not apply it as part of this list.
- "It's free." (`SignUpPage.tsx` 100) and "create a free account" (`GetStartedPage.tsx` 23, `LiveCourseDetail.tsx` "Sign in or create a free account to enroll."). These are commercial claims that are not on the cleared list. Flag them for the owner (T9) and leave them as they are.

## B. Spelling unification, user-visible strings only (T1, T2)

Comments, identifiers and legal text are excluded.

| ID | File (line) | Current text | Proposed text | Tests to update |
|---|---|---|---|---|
| C-9 | `src/pages/GetStartedPage.tsx` (23) | `Browse open courses and enrol. You sign in, or create a free account, when you enrol.` | `Browse open courses and enroll. You sign in, or create a free account, when you enroll.` | check `e2e/get-started.spec.ts` |
| C-10 | same file (29) | `My organisation wants AQS` | `My organization wants AQS` | `e2e/get-started.spec.ts` |
| C-11 | same file (36, 37) | `I was invited, or my organisation already uses AQS` and `…Your organisation's administrator can send…` | `I was invited, or my organization already uses AQS` and `…Your organization's administrator can send…` | `e2e/get-started.spec.ts` |
| C-12 | `src/live/pages/learner/LiveCourseDetail.tsx` (236) | `Enrolment in this course is arranged by its organization.` | `Enrollment in this course is arranged by its organization.` | none found |
| C-13 | `src/live/pages/learner/LiveMyCourses.tsx` (110) | `…Your enrolment and progress are kept…` | `…Your enrollment and progress are kept…` | none found |
| C-14 | `src/live/pages/teach/LiveLessonPreview.tsx` (74) | `Nothing is recorded: no enrolment, progress or quiz attempt.` | `Nothing is recorded: no enrollment, progress or quiz attempt.` | none found |
| C-15 | `src/live/pages/manage/LiveOrgSettings.tsx` (75) | `AQS has not recorded a profile for your organisation yet.` | `AQS has not recorded a profile for your organization yet.` | none found |
| C-16 | `src/live/components/DomainsCard.tsx` (54, 68, 120, 153) | `…stop joining the organisation automatically.` / `…removed from this organisation…` / `…join your organisation as learners…` / `…a domain the organisation owns…` / `…your organisation’s domain on request.` | Replace "organisation" with "organization" in each of these strings. | check the `e2e-live` domain specs |
| C-17 | `src/live/pages/teach/VideoSection.tsx` (389) | `Required: organisation-only videos need a timed caption track before publication.` | `Required: organization-only videos need a timed caption track before publication.` | none found |
| C-18 | `src/live/pages/teach/CaptionConfirmationPanel.tsx` (28) | `Organisation-only videos need confirmed timed captions before publication` | `Organization-only videos need confirmed timed captions before publication` | none found |
| C-19 | `src/live/pages/admin/LivePlatformOrganizationDetail.tsx` (302, 343, 361) | `The organisation profile was saved.` / `Visible to this organisation's Org Admins and to Platform Admins.` / `Type of organisation` | `The organization profile was saved.` / `Visible to this organization's Organization Admins and to Platform Admins.` / `Type of organization` | none found |
| C-20 **[after WS-ONBOARD]** | `src/pages/RequestWorkspacePage.tsx` (150, 151, 155, 230) | `Your organisation` / `Organisation name` / `Type of organisation` / `Your organisation's email domain` | `Your organization` / `Organization name` / `Type of organization` / `Your organization's email domain` | `e2e/request-workspace.spec.ts`, `e2e-live/live-journeys.spec.ts`, `e2e-live/live-onboarding.spec.ts` |
| C-21 **[after WS-ONBOARD]** | `src/live/pages/admin/LiveOrganizationRequests.tsx` (31, 51) and `LiveOrganizationRequestDetail.tsx` (82, 83, 103, 104, 125, 150, 152) | `Organisations asking for…`, `Organisation`, `…belongs to the organisation.`, `Check the organisation another way.`, `Does the organisation exist?…`, `Open the organisation` | Same strings with "organization". Lines 208–209 (the approval wording) are being rewritten for C2 by WS-ONBOARD; use the new spelling there. | check the `e2e-live` onboarding specs |

## C. Workspace and role names (T3, T6)

| ID | File (line) | Current text | Proposed text | Reason | Tests to update |
|---|---|---|---|---|---|
| C-22 **[after WS-CHARTS]** | `src/live/pages/manage/LiveOrgAdminDashboard.tsx` (136) | `Instructors and admins create courses in the teaching workspace.` | `Instructors and Organization Admins create courses in the Teaching Studio.` | Uses the product's name for the workspace and the D22 role name. | none found |
| C-23 **[after WS-CHARTS]** | same file (82) | `Organization admins` | `Organization Admins` | D22 canonical role name; the dashboard currently uses both forms. | check `e2e-live` org-admin specs |
| C-24 | `src/live/pages/manage/LiveOrgMembers.tsx` (180) | `Organization admins` (tab label) | `Organization Admins` | Same as C-23. | check `e2e-live` members specs (the tab may be located by its name) |
| C-25 | `src/live/pages/admin/LivePlatformOrganizations.tsx` (39, 205) | column header `Org admins` | `Organization Admins` | D22. If the narrow table cannot fit it, keep the abbreviation and give it a visually hidden full name. | none found |
| C-26 | `src/live/pages/LiveNotices.tsx` (32) | `Its learning space is closed for the moment. Your own records are kept.` | `Its workspace is closed for the moment. Your own records are kept.` | Removes a third name for the same thing (T3). | check the `e2e-live` suspended-organization spec |
| C-27 | `src/live/pages/LiveNotices.tsx` (51) | button `Sign in with Google` | `Sign in` | `/sign-in` offers every enabled method (D42) (journey F6). | check `e2e-live` session specs |

## D. Support path (N7)

| ID | File (line) | Current text | Proposed text | Reason |
|---|---|---|---|---|
| C-28 | `src/live/pages/manage/LiveOrgSettings.tsx` (47, 79) | `To change these details, contact AQS support.` | `To change these details, ask AQS through your usual AQS contact.` | Production has no Contact page or support channel. This wording does not promise one. **Replace it with a real channel** once the owner approves `CONTACT_CONTENT` and opens the About and Contact gate (an owner action, not copy). |

## E. Not to be changed

- **Legal documents and the sign-in notice.** See the rules above. Any spelling or terminology mismatch in legal text is reported to the owner, not edited.
- **Approved landing copy** (Concept C, owner approval of 10 November 2026). C-1 is the only landing edit proposed, because it fixes wording that is untrue in production. Everything else on the landing page needs owner approval.
- **The "Request a workspace" and "Workspace requests" terms** (T8). WS-ONBOARD (A5) owns these pages and should choose between "workspace request" and "organization application" for both the public form and the admin queue.
- **Completion page** (`LiveCompletion.tsx`). WS-CERT (A11) is changing it. No copy edit is proposed here.
- **Design-preview pages** (`src/pages/*` used only in development). They are historical references under C1 and do not ship. Leave them unless a shared component, such as `SignInPage.tsx` (C-7), renders live text.

## Checklist for the applier

1. Apply groups A, C (except C-22 and C-23) and D first. Then apply group B, but only if the owner accepts the spelling choice.
2. Run `grep -rn "organisation\|enrol\b\|enrolment" src --include=*.tsx`. Only comments, identifiers, `src/content/legal` and the files deferred to other workstreams should remain.
3. Run `npm run lint`, `npm run build && npm run check:build`, and the affected e2e specs listed above plus the accessibility specs. Record changed assertions.
