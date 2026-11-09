import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { LandingPage } from './pages/LandingPage'
import { NotFound } from './pages/NotFound'
import { LIVE_MODE } from './live/mode'
import { LiveApp } from './live/LiveApp'

/*
 * The design-system preview is a development tool, not a product page.
 * `import.meta.env.DEV` is true only under `npm run dev`, so the preview —
 * and its code — is left out of production builds (`npm run build`).
 */
const DesignSystemPage = import.meta.env.DEV
  ? lazy(() => import('./dev/design-system/DesignSystemPage'))
  : null

/* Development-only preview of the learner dashboard (frame 1) at /learn (D27).
 * Excluded from production builds. */
const LearnerDashboardPage = import.meta.env.DEV
  ? lazy(() => import('./pages/LearnerDashboardPage'))
  : null

/* Development-only demo of the public course detail page at /courses/:courseId (D27).
 * Provisional: its design is still "Needs review". Excluded from production builds. */
const CourseDetailPage = import.meta.env.DEV ? lazy(() => import('./pages/CourseDetailPage')) : null

/* Development-only mock auth screens (D27). Presentation only: no sign-in, provider, API,
 * session or storage behaviour (D15). */
const SignInPage = import.meta.env.DEV ? lazy(() => import('./pages/SignInPage')) : null
const SignInErrorPage = import.meta.env.DEV ? lazy(() => import('./pages/SignInErrorPage')) : null
const SignUpPage = import.meta.env.DEV ? lazy(() => import('./pages/SignUpPage')) : null
/* Development-only quiz with sample content and fixed sample results (D27, D19). */
const QuizPage = import.meta.env.DEV ? lazy(() => import('./pages/QuizPage')) : null
/* Development-only visual request-a-demo form (D27). Submission is unavailable; nothing is sent or saved. */
const RequestDemoPage = import.meta.env.DEV ? lazy(() => import('./pages/RequestDemoPage')) : null
/* Development-only lesson player with sample content and in-memory progress (D27, Phase 3). */
const LessonPage = import.meta.env.DEV ? lazy(() => import('./pages/LessonPage')) : null
  /* Development-only learner course completion preview (D30). Sample state only; no certificates. */
  const CourseCompletionPage = import.meta.env.DEV ? lazy(() => import('./pages/CourseCompletionPage')) : null
  /* Development-only preview of the shared role shells at /dev/shell/:role (Batch 1). Layout only. */
  const RolePreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/RolePreviewPage')) : null
  /* Development-only instructor dashboard and course page with sample data (Batch 3). */
  const InstructorDashboardPage = import.meta.env.DEV ? lazy(() => import('./pages/InstructorDashboardPage')) : null
  const InstructorCoursePage = import.meta.env.DEV ? lazy(() => import('./pages/InstructorCoursePage')) : null
  /* Development-only organization admin members and settings with sample data (Org Admin batch). */
  const OrgAdminMembersPage = import.meta.env.DEV ? lazy(() => import('./pages/OrgAdminMembersPage')) : null
  const OrgAdminSettingsPage = import.meta.env.DEV ? lazy(() => import('./pages/OrgAdminSettingsPage')) : null
  /* Development-only Platform Admin organizations list and detail with sample data (Platform Admin batch). */
  const PlatformAdminOrganizationsPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminOrganizationsPage'))
    : null
  const PlatformAdminOrganizationDetailPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminOrganizationDetailPage'))
    : null
  /* Development-only Platform Admin users and roles list with sample data (Users batch). */
  const PlatformAdminUsersPage = import.meta.env.DEV ? lazy(() => import('./pages/PlatformAdminUsersPage')) : null
  /* Development-only instructor quiz builder with sample data (Quiz batch). */
  const InstructorQuizBuilderPage = import.meta.env.DEV ? lazy(() => import('./pages/InstructorQuizBuilderPage')) : null
  /* Development-only course catalog and My courses design drafts with sample data (Group 1 follow-up). */
  const CatalogPage = import.meta.env.DEV ? lazy(() => import('./pages/CatalogPage')) : null
  const MyCoursesPage = import.meta.env.DEV ? lazy(() => import('./pages/MyCoursesPage')) : null
  /* Development-only pages of the remaining design set (sample data; see the design draft). */
  const InvitePage = import.meta.env.DEV ? lazy(() => import('./pages/InvitePage')) : null
  const UnlinkedUserPage = import.meta.env.DEV
    ? lazy(() => import('./pages/NoticePages').then((m) => ({ default: m.UnlinkedUserPage })))
    : null
  const AccessDeniedPage = import.meta.env.DEV
    ? lazy(() => import('./pages/NoticePages').then((m) => ({ default: m.AccessDeniedPage })))
    : null
  const InactiveAccountPage = import.meta.env.DEV
    ? lazy(() => import('./pages/NoticePages').then((m) => ({ default: m.InactiveAccountPage })))
    : null
  const SessionExpiredPage = import.meta.env.DEV
    ? lazy(() => import('./pages/NoticePages').then((m) => ({ default: m.SessionExpiredPage })))
    : null
  const OrgInvitationsPage = import.meta.env.DEV ? lazy(() => import('./pages/OrgInvitationsPage')) : null
  const OrganizationCreatePage = import.meta.env.DEV ? lazy(() => import('./pages/OrganizationCreatePage')) : null
  const OrganizationActivationPage = import.meta.env.DEV ? lazy(() => import('./pages/OrganizationActivationPage')) : null
  const PlatformAdminOverviewPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminSectionPages').then((m) => ({ default: m.PlatformAdminOverviewPage })))
    : null
  const PlatformAdminCoursesPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminSectionPages').then((m) => ({ default: m.PlatformAdminCoursesPage })))
    : null
  const PlatformAdminReportsPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminSectionPages').then((m) => ({ default: m.PlatformAdminReportsPage })))
    : null
  const PlatformAdminSettingsPage = import.meta.env.DEV
    ? lazy(() => import('./pages/PlatformAdminSectionPages').then((m) => ({ default: m.PlatformAdminSettingsPage })))
    : null
  const InstructorMessagesPage = import.meta.env.DEV
    ? lazy(() => import('./pages/InstructorSectionPages').then((m) => ({ default: m.InstructorMessagesPage })))
    : null
  const InstructorLearnersPage = import.meta.env.DEV
    ? lazy(() => import('./pages/InstructorSectionPages').then((m) => ({ default: m.InstructorLearnersPage })))
    : null
  const InstructorInvitationsPage = import.meta.env.DEV
    ? lazy(() => import('./pages/InstructorSectionPages').then((m) => ({ default: m.InstructorInvitationsPage })))
    : null
  const InstructorReportsPage = import.meta.env.DEV
    ? lazy(() => import('./pages/InstructorSectionPages').then((m) => ({ default: m.InstructorReportsPage })))
    : null
  const LearnerProfilePage = import.meta.env.DEV ? lazy(() => import('./pages/LearnerProfilePage')) : null
  /* Development-only pages authorised on 26 October 2026: learner messages placeholder, instructor courses
   * list, organization admin dashboard, and the public About and Contact pages (sample or placeholder content). */
  const LearnerMessagesPage = import.meta.env.DEV ? lazy(() => import('./pages/LearnerMessagesPage')) : null
  const InstructorCoursesPage = import.meta.env.DEV ? lazy(() => import('./pages/InstructorCoursesPage')) : null
  const OrgAdminDashboardPage = import.meta.env.DEV ? lazy(() => import('./pages/OrgAdminDashboardPage')) : null
  const AboutPage = import.meta.env.DEV ? lazy(() => import('./pages/AboutPage')) : null
  const ContactPage = import.meta.env.DEV ? lazy(() => import('./pages/ContactPage')) : null

export default function App() {
  if (LIVE_MODE) {
    return (
      <BrowserRouter>
        <LiveApp />
      </BrowserRouter>
    )
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {DesignSystemPage ? (
          <Route
            path="/design-system"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading design system…</p>}>
                <DesignSystemPage />
              </Suspense>
            }
          />
        ) : null}
        {LearnerDashboardPage ? (
          <Route
            path="/learn"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading learner dashboard…</p>}>
                <LearnerDashboardPage />
              </Suspense>
            }
          />
        ) : null}
        {CourseDetailPage ? (
          <Route
            path="/courses/:courseId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading course detail…</p>}>
                <CourseDetailPage />
              </Suspense>
            }
          />
        ) : null}
        {SignInPage ? (
          <Route
            path="/sign-in"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading sign-in…</p>}>
                <SignInPage />
              </Suspense>
            }
          />
        ) : null}
        {SignInErrorPage ? (
          <Route
            path="/sign-in/error"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading sign-in error…</p>}>
                <SignInErrorPage />
              </Suspense>
            }
          />
        ) : null}
        {SignUpPage ? (
          <Route
            path="/sign-up"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading sign-up…</p>}>
                <SignUpPage />
              </Suspense>
            }
          />
        ) : null}
        {RequestDemoPage ? (
          <Route
            path="/request-demo"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading request a demo…</p>}>
                <RequestDemoPage />
              </Suspense>
            }
          />
        ) : null}
        {QuizPage ? (
          <Route
            path="/learn/courses/:courseId/quizzes/:quizId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading quiz…</p>}>
                <QuizPage />
              </Suspense>
            }
          />
        ) : null}
        {LessonPage ? (
          <Route
            path="/learn/courses/:courseId/lessons/:lessonId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading lesson…</p>}>
                <LessonPage />
              </Suspense>
            }
          />
        ) : null}
        {CourseCompletionPage ? (
          <Route
            path="/learn/courses/:courseId/complete"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading completion preview…</p>}>
                <CourseCompletionPage />
              </Suspense>
            }
          />
        ) : null}
        {RolePreviewPage ? (
          <Route
            path="/dev/shell/:role"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading role preview…</p>}>
                <RolePreviewPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorDashboardPage ? (
          <Route
            path="/o/:orgSlug/teach"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading instructor dashboard…</p>}>
                <InstructorDashboardPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorCoursePage ? (
          <Route
            path="/o/:orgSlug/teach/courses/:courseId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading course builder…</p>}>
                <InstructorCoursePage />
              </Suspense>
            }
          />
        ) : null}
        {OrgAdminMembersPage ? (
          <Route
            path="/o/:orgSlug/manage/members"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading members…</p>}>
                <OrgAdminMembersPage />
              </Suspense>
            }
          />
        ) : null}
        {OrgAdminSettingsPage ? (
          <Route
            path="/o/:orgSlug/manage/settings"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading settings…</p>}>
                <OrgAdminSettingsPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminOrganizationsPage ? (
          <Route
            path="/admin/organizations"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading organizations…</p>}>
                <PlatformAdminOrganizationsPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminOrganizationDetailPage ? (
          <Route
            path="/admin/organizations/:orgId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading organization…</p>}>
                <PlatformAdminOrganizationDetailPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminUsersPage ? (
          <Route
            path="/admin/users"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading users…</p>}>
                <PlatformAdminUsersPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorQuizBuilderPage ? (
          <Route
            path="/o/:orgSlug/teach/courses/:courseId/quizzes/:quizId"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading quiz builder…</p>}>
                <InstructorQuizBuilderPage />
              </Suspense>
            }
          />
        ) : null}
        {CatalogPage ? (
          <Route
            path="/catalog"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading catalog…</p>}>
                <CatalogPage />
              </Suspense>
            }
          />
        ) : null}
        {MyCoursesPage ? (
          <Route
            path="/my-courses"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading my courses…</p>}>
                <MyCoursesPage />
              </Suspense>
            }
          />
        ) : null}
        {InvitePage ? (
          <Route
            path="/invite/:token"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading invitation…</p>}>
                <InvitePage />
              </Suspense>
            }
          />
        ) : null}
        {UnlinkedUserPage ? (
          <Route
            path="/sign-in/unlinked"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading page…</p>}>
                <UnlinkedUserPage />
              </Suspense>
            }
          />
        ) : null}
        {AccessDeniedPage ? (
          <Route
            path="/access-denied"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading page…</p>}>
                <AccessDeniedPage />
              </Suspense>
            }
          />
        ) : null}
        {InactiveAccountPage ? (
          <Route
            path="/account-inactive"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading page…</p>}>
                <InactiveAccountPage />
              </Suspense>
            }
          />
        ) : null}
        {SessionExpiredPage ? (
          <Route
            path="/session-expired"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading page…</p>}>
                <SessionExpiredPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminOverviewPage ? (
          <Route
            path="/admin"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading overview…</p>}>
                <PlatformAdminOverviewPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminCoursesPage ? (
          <Route
            path="/admin/courses"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading courses…</p>}>
                <PlatformAdminCoursesPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminReportsPage ? (
          <Route
            path="/admin/reports"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading reports…</p>}>
                <PlatformAdminReportsPage />
              </Suspense>
            }
          />
        ) : null}
        {PlatformAdminSettingsPage ? (
          <Route
            path="/admin/settings"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading settings…</p>}>
                <PlatformAdminSettingsPage />
              </Suspense>
            }
          />
        ) : null}
        {OrganizationCreatePage ? (
          <Route
            path="/admin/organizations/new"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading form…</p>}>
                <OrganizationCreatePage />
              </Suspense>
            }
          />
        ) : null}
        {OrganizationActivationPage ? (
          <Route
            path="/admin/organizations/:orgId/review"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading review…</p>}>
                <OrganizationActivationPage />
              </Suspense>
            }
          />
        ) : null}
        {OrgInvitationsPage ? (
          <Route
            path="/o/:orgSlug/manage/invitations"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading invitations…</p>}>
                <OrgInvitationsPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorMessagesPage ? (
          <Route
            path="/o/:orgSlug/teach/messages"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading messages…</p>}>
                <InstructorMessagesPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorLearnersPage ? (
          <Route
            path="/o/:orgSlug/teach/learners"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading learners…</p>}>
                <InstructorLearnersPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorInvitationsPage ? (
          <Route
            path="/o/:orgSlug/teach/invitations"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading invitations…</p>}>
                <InstructorInvitationsPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorReportsPage ? (
          <Route
            path="/o/:orgSlug/teach/reports"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading reports…</p>}>
                <InstructorReportsPage />
              </Suspense>
            }
          />
        ) : null}
        {LearnerProfilePage ? (
          <Route
            path="/profile"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading profile…</p>}>
                <LearnerProfilePage />
              </Suspense>
            }
          />
        ) : null}
        {LearnerMessagesPage ? (
          <Route
            path="/messages"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading messages…</p>}>
                <LearnerMessagesPage />
              </Suspense>
            }
          />
        ) : null}
        {InstructorCoursesPage ? (
          <Route
            path="/o/:orgSlug/teach/courses"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading courses…</p>}>
                <InstructorCoursesPage />
              </Suspense>
            }
          />
        ) : null}
        {OrgAdminDashboardPage ? (
          <Route
            path="/o/:orgSlug/manage"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading organization dashboard…</p>}>
                <OrgAdminDashboardPage />
              </Suspense>
            }
          />
        ) : null}
        {AboutPage ? (
          <Route
            path="/about"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading about…</p>}>
                <AboutPage />
              </Suspense>
            }
          />
        ) : null}
        {ContactPage ? (
          <Route
            path="/contact"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading contact…</p>}>
                <ContactPage />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
