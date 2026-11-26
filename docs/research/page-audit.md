# AQS page audit (A12, brief Parts 3.1–3.3)

Prepared by WS-RESEARCH, 23 November 2026, from the integration copy at `/home/claude/aqs` (`5be29c6`). It was read only: no file was changed. Line numbers refer to that copy.

**Classification (brief 3.1)**
- **Essential:** the product cannot work without it.
- **Valuable:** clearly useful, keep it.
- **Redundant:** duplicates another page or route.
- **Unnecessary:** no current purpose.
- **Deferred:** built or planned, but held back by an owner gate.

No working functionality is recommended for removal. Consolidation candidates are suggestions about navigation, not deletions.

**How routing works**
- `src/App.tsx` picks a mode. When Supabase is configured (`LIVE_MODE`, `src/live/mode.ts`), it renders `src/live/LiveApp.tsx` only. Otherwise it renders the design-preview routes.
- In the preview set, every route except `/`, `/get-started`, `/terms`, `/privacy` and `/cookies` (and Not Found) sits behind `import.meta.env.DEV`. Production builds leave those routes out.
- `scripts/check-production-build.mjs` then scans `dist/` for preview pages, sample data, placeholders, decision codes, secrets, and the About and Contact pages while the `ABOUT_AND_CONTACT_APPROVED` gate in `src/content/public-site.ts` is closed.

---

## A. Live application routes (production when Supabase is configured)

### A1. Public pages (no sign-in)

| Route | Page (file) | Audience | Purpose | Class | Notes |
|---|---|---|---|---|---|
| `/` | `src/pages/LandingPage.tsx` | Everyone | Landing page, "two doors": learn on my own, or train a team | Essential | The empty course state offers "Browse sample course catalog" (l. 218), but production has no sample catalogue. The "Set up training" door goes to the `#organizations` section rather than straight to the request form, an extra step that is still acceptable. |
| `/get-started` | `src/pages/GetStartedPage.tsx` | Visitors | Chooser between three journeys: learn alone, my organisation wants AQS, I was invited | Valuable | **Consolidation candidate** with the landing page's two doors: it repeats them and adds the "invited" path. Keep it, because it is the only page that explains the invited path. Spelling is British (organisation, enrol); see T1 and T2 below. |
| `/request-workspace` | `src/live/pages/LiveRequestWorkspacePage.tsx`, which renders `src/pages/RequestWorkspacePage.tsx` | Organisation contacts | Apply for an organisation workspace | Essential | Mixed spelling on one page: the eyebrow says "For organizations" (l. 113), the fields say "Organisation name" and "Your organisation". WS-ONBOARD (A5) is changing this form, so copy edits should follow its merge. |
| `/catalog` | `src/live/pages/learner/LiveCatalog.tsx` | Visitors and signed-in users | Course list. Signed out: public courses. Signed in: public plus the user's organisations' courses | Essential | The page is titled "Courses", but the learner menu calls it "Catalog" and the dashboard links to "Explore catalog" (T4). |
| `/courses/:courseId` | `src/live/pages/learner/LiveCourseDetail.tsx` | Visitors and learners | Course outline, instructors, and how to join | Essential | "Enrolment in this course is arranged by its organization." (l. 236) mixes British and US spelling in one sentence. |
| `/sign-in` | `src/live/pages/LiveSignInPage.tsx`, which renders `SignInView` in `src/pages/SignInPage.tsx` | Everyone | Sign in (Google, plus Apple, Facebook or email where enabled, D42) | Essential | The lead line "Sign in to continue your courses…" (l. 86) addresses only learners, though admins and instructors sign in here too. |
| `/sign-up` | `src/live/pages/LiveSignUpPage.tsx`, which renders `SignUpView` in `src/pages/SignUpPage.tsx` | Individuals | Create a learner account | Essential | "It's free." (l. 100) is a commercial statement that is not in the cleared-claims list (`public-site.ts`). The owner should confirm it. |
| `/auth/callback` | `src/live/pages/AuthCallbackPage.tsx` | Everyone, technical step | Completes the OAuth or email sign-in, then redirects | Essential | No copy issues. |
| `/invite`, `/invite/:token` | `src/live/pages/LiveInvitePage.tsx` | People who were invited | Accept an organisation invitation (Google identity, D33) | Essential | Clear. Both routes are needed (with and without a token). |
| `/terms`, `/privacy`, `/cookies` | `src/pages/legal/LegalPage.tsx`, with text from `src/content/legal` | Everyone | The owner's legal documents, marked provisional (`LEGAL_CONTENT_FINAL = false`) | Essential | **Legal text is owner-supplied. Do not edit it** (see `copy-changes.md`). |
| `/about`, `/contact` | `src/pages/AboutPage.tsx`, `src/pages/ContactPage.tsx` | Everyone | Company and contact information | **Deferred** | Registered only in development builds until the owner approves the content (`ABOUT_AND_CONTACT_APPROVED = false`). The build check blocks them in production. This leaves production with no contact route at all, although "contact AQS support" appears in the Organization details page (J9). |
| `/access-denied` | `LiveAccessDenied` in `src/live/pages/LiveNotices.tsx` | Signed-in users | Notice when a role is missing | Essential | |
| `/session-expired` | `LiveSignInRequired` in `LiveNotices.tsx` | Everyone | Notice that the session ended | Essential | Its button says "Sign in with Google" (l. 51), but it opens `/sign-in`, which offers every enabled method (D42). |
| `*` | `src/pages/NotFound.tsx` | Everyone | Not found | Essential | |

### A2. Signed in: learner space ("My learning"; menu from `learnerShell()` in `src/live/navigation.ts`)

Live menu: Dashboard, My courses, Catalog, Profile. Certificates and Messages are filtered out until built (P21). Certificates should return with A11 (WS-CERT).

| Route | Page (file) | Purpose | Class | Notes |
|---|---|---|---|---|
| `/home` | `HomeRedirect` in `src/live/guards.tsx` | Sends the person to their first workspace, in the order Platform, then Organization workspace, then Teaching Studio, then My learning (`workspacesFor`) | Essential | A person with several roles always lands on the highest-ranked workspace; there is no "last used". This is acceptable. |
| `/learn` | `src/live/pages/learner/LiveLearnerDashboard.tsx` | Continue-learning hero, stats, my courses by status, other courses | Essential | "Recommended for you" (l. 107) implies personalisation that does not exist; the list is simply other courses open to the person. "Explore more practical skills from the AQS catalog" (l. 108) implies AQS sells a catalogue. The empty state talks about the catalogue only; it never says the organisation assigns courses (l. 128). |
| `/my-courses` | `src/live/pages/learner/LiveMyCourses.tsx` | Full list with filters, sorting and due dates | Essential | **Consolidation candidate:** the dashboard's "My courses" tabs repeat this list. Keep both: the dashboard shows a summary, this page is complete. "Your enrolment and progress" (l. 110) uses British spelling. |
| `/profile` | `src/live/pages/learner/LiveProfile.tsx` | Display name, email, organisations and roles | Essential | It is reachable only from the learner menu, so staff open it through "My learning". Instructor "Profile" is hidden. Acceptable; note it for navigation. |
| `/learn/courses/:courseId/lessons/:lessonId` | `src/live/pages/learner/LiveLessonPage.tsx` | Lesson player, "Mark as done", next and previous | Essential | |
| `/learn/courses/:courseId/quizzes/:quizId` | `src/live/pages/learner/LiveQuizPage.tsx` | Quiz attempt and results | Essential | |
| `/learn/courses/:courseId/complete` | `src/live/pages/learner/LiveCompletion.tsx` | Completion confirmation | Essential | No certificate yet. A11 adds it here. |

### A3. Signed in: Teaching Studio (`/o/:orgSlug/teach`, Instructor or Organization Admin; menu from `instructorShell()`)

Live menu: Dashboard, Courses, Learners. Invitations, Messages, Reports and Profile are filtered out.

| Route | Page (file) | Purpose | Class | Notes |
|---|---|---|---|---|
| `…/teach` | `src/live/pages/teach/LiveInstructorDashboard.tsx` | "Your courses": stats, completion and quiz charts, course cards | Valuable | **Consolidation candidate** with `…/teach/courses`. Both list the person's courses. Keep both for now (dashboard as summary, Courses as the managed table). |
| `…/teach/courses` | `src/live/pages/teach/LiveInstructorCourses.tsx` | Course table and "New course" | Essential | |
| `…/teach/courses/:courseId` | `src/live/pages/teach/LiveCourseEditor.tsx` with `CoursePanels`, `OutlinePanel`, `LessonPanel`, `VideoSection`, `CaptionConfirmationPanel`, `CorrectionsPanel` | Course builder: details, outline, staff, publication, archive, **assign to members** (Organization Admins only) | Essential | **Placement issue (N1):** assigning courses to staff is an Organization Admin task, but it can only be done here, one member at a time (`CoursePanels.tsx` l. 395–434). The Organization Workspace has no way to assign. |
| `…/teach/courses/:courseId/quizzes/:quizId` | `src/live/pages/teach/LiveQuizBuilder.tsx` | Quiz editor | Essential | |
| `…/teach/courses/:courseId/preview[/:lessonId]` | `src/live/pages/teach/LiveLessonPreview.tsx` | Preview the course as a learner, with nothing recorded | Valuable | "no enrolment" (l. 74) uses British spelling. |
| `…/teach/learners` | `src/live/pages/teach/LiveTeachLearners.tsx` | Progress, overdue status and quiz results per course | Essential | For Organization Admins this is the only per-learner progress view, and it sits in the Teaching Studio (N2). |

### A4. Signed in: Organization Workspace (`/o/:orgSlug/manage`, Organization Admin; menu from `orgAdminShell()`)

Live menu: Dashboard, Members, Invitations and domains, Organization details.

| Route | Page (file) | Purpose | Class | Notes |
|---|---|---|---|---|
| `…/manage` | `src/live/pages/manage/LiveOrgAdminDashboard.tsx` | Overview: members, pending invitations, courses awaiting approval, charts, people by role | Essential | Copy says "teaching workspace" (l. 136) where the product name is "Teaching Studio". The role is written as "Organization admins" (l. 82), but the canonical form is "Organization Admins" (D22). |
| `…/manage/members` | `src/live/pages/manage/LiveOrgMembers.tsx` | Member list, change roles, suspend, remove | Essential | Tab label "Organization admins" (l. 180) has the same case issue. |
| `…/manage/invitations` | `src/live/pages/manage/LiveOrgInvitations.tsx` plus `src/live/components/DomainsCard.tsx` | Invite Learners and Instructors; domain admission | Essential | The page heading is "Invitations" while the menu says "Invitations and domains". Acceptable. `DomainsCard` uses "organisation" four times. |
| `…/manage/settings` | `src/live/pages/manage/LiveOrgSettings.tsx` | Read-only organisation details and profile | Valuable | The menu says "Organization details" but the URL says `settings`. Acceptable. "To change these details, contact AQS support." (l. 47, 79) names no channel, and production has no Contact page. "your organisation yet" (l. 75) uses British spelling. |

### A5. Signed in: Platform Control Center (`/admin`, Platform Admin; menu from `platformShell()`)

Live menu: Overview, Organizations, Workspace requests, Support lookup, Courses, Video reviews, Reports. Settings is filtered out.

| Route | Page (file) | Purpose | Class | Notes |
|---|---|---|---|---|
| `/admin` | `LivePlatformOverview` in `src/live/pages/admin/LivePlatformOrganizations.tsx` | Counts, charts, and the first 8 organisations | Essential | **Consolidation candidate** with `/admin/reports`: both show the same P19 report. |
| `/admin/organizations` | `LivePlatformOrganizations` | Organisation list | Essential | |
| `/admin/organizations/new` | `LiveOrganizationCreate` | Create an organisation directly, as a draft | Valuable | Still needed for organisations that do not apply through the form. C2 does not change this path. |
| `/admin/organizations/:orgId` | `src/live/pages/admin/LivePlatformOrganizationDetail.tsx` | Status, Organization Admins, invitations, profile, domains | Essential | Copy mixes "Org Admins" (l. 343) with "Organization Admins" (l. 222), and "organisation" (l. 343) with "organization". The success banner "Draft workspace created from the request… Nothing has been sent yet." is superseded by C2; WS-ONBOARD owns it. |
| `/admin/organizations/:orgId/review` | The same component as the detail route (`LiveApp.tsx` l. 130) | None of its own: an alias left over from the design's activation page | **Redundant** | Nothing in `src/live` links to it. Keep it as a harmless alias, or redirect it to the detail route. Low priority. |
| `/admin/requests` | `src/live/pages/admin/LiveOrganizationRequests.tsx` | Queue of workspace requests | Essential | Says "Organisations" (l. 31, 51) beside "Organizations" in the menu. WS-ONBOARD (A5) is changing it. |
| `/admin/requests/:requestId` | `src/live/pages/admin/LiveOrganizationRequestDetail.tsx` | Review, then approve or decline | Essential | The approval wording ("creates one organisation in Draft… sends no invitation", l. 208–209) is superseded by C2; WS-ONBOARD owns it. |
| `/admin/users` | `src/live/pages/admin/LivePlatformUsers.tsx` ("Support lookup") | Audited, case-based lookup of invitations (L11) | Valuable | The label fits its purpose. The URL stays `/users`. |
| `/admin/courses` | `src/live/pages/admin/LivePlatformCourses.tsx` | AQS-owned public courses, and organisation courses waiting for a decision | Essential | "Platform courses: Public courses owned by AQS." is accurate. Keep marketing copy from suggesting a for-sale catalogue. |
| `/admin/courses/:courseId[/quizzes/:quizId][/preview[/:lessonId]]` | The same editor, quiz builder and preview as the Teaching Studio | Authoring AQS-owned courses | Essential | |
| `/admin/reports` | `LivePlatformReports` | Full P19 count table | Valuable | Has a title but no description (l. 213). See the consolidation note on `/admin`. |
| `/admin/video-reviews`, `/admin/video-reviews/:submissionId` | `src/live/pages/admin/LiveVideoReviews.tsx`, `LiveVideoReviewDetail.tsx` | AQS review gate before public-course videos go to YouTube (D39) | Essential | |

---

## B. Design-preview routes (`src/App.tsx` when not in live mode)

These are **development-preview only, excluded from production** (`import.meta.env.DEV`, enforced by `check-production-build.mjs`). They use sample data from `src/dev` and are the targets of the `e2e/` Playwright specs. They are not product pages. The live app does not register them, even in development.

| Route | Page | Status | Note |
|---|---|---|---|
| `/` , `/get-started`, `/terms`, `/privacy`, `/cookies` | As in A1 | **Shipped** in non-live production builds | Real pages |
| `/request-workspace` | `RequestWorkspacePreview.tsx` | Dev only | The form preview that sends nothing |
| `/design-system` | `src/dev/design-system/DesignSystemPage` | Dev only | Tool |
| `/dev/shell/:role` | `RolePreviewPage.tsx` | Dev only | Tool |
| `/learn`, `/my-courses`, `/catalog`, `/profile`, `/messages` | `LearnerDashboardPage`, `MyCoursesPage`, `CatalogPage`, `LearnerProfilePage`, `LearnerMessagesPage` | Dev only | Design references. `/messages` is **Deferred** (P21) |
| `/courses/:courseId` | `CourseDetailPage.tsx` | Dev only | |
| `/learn/courses/:id/lessons/:id`, `…/quizzes/:id`, `…/complete` | `LessonPage`, `QuizPage`, `CourseCompletionPage` | Dev only | |
| `/sign-in`, `/sign-in/error`, `/sign-up` | `SignInPage`, `SignInErrorPage`, `SignUpPage` | Dev only | Mock authentication screens |
| `/sign-in/unlinked`, `/access-denied`, `/account-inactive`, `/session-expired` | `NoticePages.tsx` | Dev only | |
| `/invite/:token` | `InvitePage.tsx` | Dev only | |
| `/request-demo` | `RequestDemoPage.tsx` | Dev only | **Unnecessary**: replaced by `/request-workspace`. Still covered by `e2e/request-demo.spec.ts`, so retire the page and its spec together, later, by owner choice |
| `/o/:slug/teach`, `…/teach/courses`, `…/teach/courses/:id`, `…/quizzes/:id`, `…/teach/learners` | `InstructorDashboardPage`, `InstructorCoursesPage`, `InstructorCoursePage`, `InstructorQuizBuilderPage`, `InstructorSectionPages` | Dev only | |
| `/o/:slug/teach/invitations`, `…/reports`, `…/messages` | `InstructorSectionPages.tsx` | Dev only | **Deferred** (D6 and P21: instructors do not send invitations; messaging and instructor reports are out of the first release) |
| `/o/:slug/manage`, `…/members`, `…/invitations`, `…/settings` | `OrgAdminDashboardPage`, `OrgAdminMembersPage`, `OrgInvitationsPage`, `OrgAdminSettingsPage` | Dev only | |
| `/admin`, `/admin/courses`, `/admin/reports`, `/admin/settings` | `PlatformAdminSectionPages.tsx` | Dev only | `/admin/settings` is **Deferred** (no live page) |
| `/admin/organizations`, `/admin/organizations/:id`, `/admin/organizations/new`, `/admin/organizations/:id/review`, `/admin/users` | `PlatformAdminOrganizationsPage`, `PlatformAdminOrganizationDetailPage` (+ `OrgDetailTabs`), `OrganizationCreatePage`, `OrganizationActivationPage`, `PlatformAdminUsersPage` | Dev only | Under C2, the activation preview no longer matches how approved applications activate. It is a historical design reference only (C1) |
| `/about`, `/contact` | `AboutPage`, `ContactPage` | Dev only until the gate opens | **Deferred** |
| (no route) | `src/pages/HomePlaceholder.tsx` | Not imported anywhere | **Unnecessary**: a dead file. Safe to delete later; low priority |

C1 makes the live UI the design baseline, so these previews are now historical. Keep them while e2e specs depend on them. Do not treat them as the design to follow.

---

## C. Navigation placement findings (role-appropriate navigation, progressive disclosure)

- **N1. Course assignment is hidden in the wrong workspace.** Organization Admins assign courses from Teaching Studio › course › "Assign to members", one person at a time. The Organization Workspace menu has no "Courses" or "Assign training" entry. The dashboard only points to the Teaching Studio ("Courses open in the Teaching Studio."). Competitors place enrolment with the admin or manager (`competitor-research.md` §5).
  - **Recommendation:** add an Organization Workspace entry point for assignment (owner scope decision; see ranked recommendation 3).
- **N2. Learner progress for Organization Admins lives in the Teaching Studio** (`…/teach/learners`). The Organization Workspace has charts but no per-person view.
  - **Recommendation:** within A7 (dashboard consistency), link the dashboard's charts to `…/teach/learners`, or add a "Progress" link. Do not move the page.
- **N3. Switching roles.** The menus never show which other workspaces exist; the header switcher does that (`src/live/components/WorkspaceSwitcher.tsx`). Labels: "AQS Platform · Control Center", "<Org> · Organization workspace", "<Org> · Teaching Studio", "My learning".
  - **Recommendation:** keep the switcher (it works), and use these four names in all copy (see T3).
- **N4. Progressive disclosure is good.** Unbuilt items are removed from live menus (navigation.ts, Phase 3), stat cards appear only when they have something to count, and the help card is hidden (`hideUnbuilt`). Keep this.
- **N5. Platform menu has seven items, two of them overlapping** (Overview and Reports). Acceptable for one AQS role. Consolidate only if the menu grows (for example with A5 application statuses).
- **N6. Learner menu label "Catalog"** differs from the page title "Courses" and the public header "Courses". See T4.
- **N7. No help or contact path in production.** Help Center is hidden, About and Contact are gated, the platform tutorials show "coming later", yet Organization details says "contact AQS support".
  - **Recommendation:** an owner action to approve the contact details (`CONTACT_CONTENT`) is the real fix. Meanwhile, change the copy (see `copy-changes.md` C-14).

## D. Terminology findings

- **T1. organisation vs organization.** The UI overwhelmingly uses "organization" (roughly 650 matches in source, against roughly 40 for "organisation", most of them in comments or identifiers). D22's canonical role name is "Organization Admin". The British spelling appears in user-visible text in:
  - `GetStartedPage.tsx`
  - `RequestWorkspacePage.tsx`
  - `DomainsCard.tsx`
  - `LiveOrganizationRequests.tsx`
  - `LiveOrganizationRequestDetail.tsx`
  - `LivePlatformOrganizationDetail.tsx` (l. 343)
  - `LiveOrgSettings.tsx` (l. 75)
  - `VideoSection.tsx` (l. 389)
  - `CaptionConfirmationPanel.tsx` (l. 28)

  **Recommendation:** use one spelling in the UI. The proposal is "organization", because it is dominant and matches D22. This is an owner choice; the brief's "British-leaning spelling as already used" points the other way, so if the owner prefers British, the change is the reverse and much larger. Legal text is out of scope either way.
- **T2. enrol and enrolment vs enroll and enrollment.** The UI is mostly "enroll" and "Enroll". British forms appear in `GetStartedPage.tsx` (l. 23), `LiveCourseDetail.tsx` (l. 236), `LiveMyCourses.tsx` (l. 110) and `LiveLessonPreview.tsx` (l. 74). Same recommendation as T1.
- **T3. Workspace names.** "Teaching Studio" is sometimes called the "teaching workspace" (`LiveOrgAdminDashboard.tsx` l. 136). A suspended organisation's area is called a "learning space" (`LiveNotices.tsx` l. 32). The public header says "My workspace" for everyone, including pure learners whose space is "My learning".

  **Recommendation:** fixed names: **Organization workspace**, **Teaching Studio**, **Control Center**, **My learning**. "Workspace" alone means an organisation's private area, as in "Request a workspace".
- **T4. Catalogue language implies AQS sells courses.** Examples: "Explore more practical skills from the AQS catalog", "Recommended for you", "Browse sample course catalog", and the menu item "Catalog".

  **Recommendation:** describe courses as "open to you" (from your organisations and public courses), not as an AQS catalogue.
- **T5. Learner-only wording on shared pages.** The sign-in lead line assumes a learner. The dashboard's empty state never mentions that the organisation assigns courses.
- **T6. Role names.** These appear: "Organization Admin" (canonical), "Organization admins", "Org Admins" and "Org admins" (platform reports and profile copy). Plain "organization administrator" in learner-facing notices is fine.

  **Recommendation:** use "Organization Admin(s)" in admin interfaces. Keep "your organization's administrator" in learner copy.
- **T7. "programme" or "program", and "student".** No occurrences in the UI. Nothing to change.
- **T8. "Workspace request" vs "organisation application".** C2 and the brief say "organisation application". The UI says "Request a workspace" and "Workspace requests". Not changed here: WS-ONBOARD (A5) owns these pages and the A5 statuses. They should pick one term and use it in both the public form and the admin queue.
- **T9. Commercial wording.** "It's free" and "create a free account" (sign-up, Get Started) are not in the cleared-claims list. Flag them for the owner; no change is proposed.

---

## E. Customer journey walkthrough (brief 3.3)

The table follows an individual learner (I) and an organisation staff member (O) through each stage. Friction points are marked **F**.

| Stage | What happens | Friction |
|---|---|---|
| Discovery | `/` (LandingPage) shows the two doors, featured public courses, "For organizations" with setup steps, and a closing call to action. Header: Home, Courses, Sign in, Get started. | **F1** When there are no public courses, the empty state offers "Browse sample course catalog" (l. 218), which promises sample courses that do not exist in production. **F2** "Build the skills that move your career forward." addresses only individuals; the organisation proposition comes later on the page. This is approved Concept C copy, so it is the owner's choice. |
| Understanding | The `#organizations` section, plus `/get-started` with three paths. About is not in production (gate). | **F3** There is no About or Contact page in production, so an organisation cannot find who AQS is or how to reach it before applying (owner content gate, `public-site.ts`). |
| Register | I: `/sign-up` creates a learner account (D42). O: either `/request-workspace` (organisation contact) or an emailed invitation (staff). | **F4** "Create your learner account… It's free." is right for I, but staff arriving from search may sign up instead of using their invitation. The sign-up page's only organisation link goes to the landing section ("See how organizations get started"), not to the "I was invited" guidance on `/get-started`. |
| Sign in | `/sign-in`. Invitations require the Google account for the invited address (D33). | **F5** The lead line "Sign in to continue your courses" assumes a learner. **F6** The session-expired notice's button says "Sign in with Google" even where email or Apple is enabled. |
| Onboarding | O: `/invite/:token`, then "Join <Org>", then "Go to my dashboard" (`LiveInvitePage.tsx`). Organisation contact: request, AQS review, automatic activation with an Org Admin invitation (C2, WS-ONBOARD). | **F7** After accepting, `/home` sends a staff member who is only a learner to `/learn`. If nothing is assigned yet, the dashboard says "Start your first course… Choose a course from the catalog", which suggests self-service rather than "your organization will assign courses" (`LiveLearnerDashboard.tsx` l. 127–128). |
| Find training | `/catalog` titled "Courses": "Courses open to you" with badges "Public" and "Your organization". Assigned courses appear in My courses. | **F8** The menu says "Catalog" and the page says "Courses" (N6). Organisation-only courses show "Your organization assigns this course. Ask your organization administrator if you need it." This is clear. |
| Learn | Lesson player with "Mark as done", next and previous, file downloads, and quizzes with review (`LiveLessonPage.tsx`, `LiveQuizPage.tsx`). | No copy issues found. Mobile layout follows D9 (FocusLayout and the lesson sheet). Check at 390 px under A13. |
| Track progress | Dashboard hero and stats, My courses filters, sorting by due date, overdue badges. Staff side: `…/teach/learners`; Organization Admin charts on the dashboard. | **F9** Organization Admins must go to the Teaching Studio to see per-person progress (N2) and to assign courses one person at a time (N1). |
| Completion and certificate | The last lesson's "Finish course" opens `/learn/courses/:id/complete`: "Congratulations!" with the completion date. | **F10** There is no certificate yet; A11 (WS-CERT) adds it. Until then, the "Certificates" menu entry stays hidden, which is correct. |
| Account | `/profile`: display name, email (fixed by the provider), organisations and roles. | **F11** Staff reach their profile only through "My learning" (the instructor Profile item is hidden). There is no help path in production, and Organization details says "contact AQS support" without a channel (N7). |

### Quick wins (copy only; listed in `copy-changes.md`)

- F1, F5, F6 and F7.
- The T1 and T2 spelling unification.
- T3 workspace names.
- T4 catalogue wording.
- T6 role names.

### Needs an owner scope decision (not copy)

- N1 and N2: assignment and progress in the Organization Workspace.
- F3: About and Contact content approval.
- T9: the "free" claim.
- The T1 spelling choice.
