import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { LandingPage } from '../pages/LandingPage'
import { NotFound } from '../pages/NotFound'
import { LoadingBlock } from './components/States'
import { HomeRedirect, RequireOrgRole, RequirePlatformAdmin, RequireSignedIn } from './guards'
import { SessionProvider } from './SessionProvider'
import { LiveAccessDenied, LiveSignInRequired } from './pages/LiveNotices'

/*
 * Routes of the live application (Supabase configured). Paths match the approved previews so
 * the design references map one to one. Guards shape what is shown; the database enforces
 * access on every request (D21).
 */

const LiveSignInPage = lazy(() => import('./pages/LiveSignInPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const LiveInvitePage = lazy(() => import('./pages/LiveInvitePage'))
const LiveLearnerDashboard = lazy(() => import('./pages/learner/LiveLearnerDashboard'))
const LiveCatalog = lazy(() => import('./pages/learner/LiveCatalog'))
const LiveCourseDetail = lazy(() => import('./pages/learner/LiveCourseDetail'))
const LiveMyCourses = lazy(() => import('./pages/learner/LiveMyCourses'))
const LiveLessonPage = lazy(() => import('./pages/learner/LiveLessonPage'))
const LiveQuizPage = lazy(() => import('./pages/learner/LiveQuizPage'))
const LiveCompletion = lazy(() => import('./pages/learner/LiveCompletion'))
const LiveProfile = lazy(() => import('./pages/learner/LiveProfile'))
const LiveInstructorDashboard = lazy(() => import('./pages/teach/LiveInstructorDashboard'))
const LiveInstructorCourses = lazy(() => import('./pages/teach/LiveInstructorCourses'))
const LiveCourseEditor = lazy(() => import('./pages/teach/LiveCourseEditor'))
const LiveQuizBuilder = lazy(() => import('./pages/teach/LiveQuizBuilder'))
const LiveTeachLearners = lazy(() => import('./pages/teach/LiveTeachLearners'))
const LiveOrgAdminDashboard = lazy(() => import('./pages/manage/LiveOrgAdminDashboard'))
const LiveOrgMembers = lazy(() => import('./pages/manage/LiveOrgMembers'))
const LiveOrgInvitations = lazy(() => import('./pages/manage/LiveOrgInvitations'))
const LiveOrgSettings = lazy(() => import('./pages/manage/LiveOrgSettings'))
const LivePlatformOrganizations = lazy(() => import('./pages/admin/LivePlatformOrganizations'))
const LivePlatformOverview = lazy(() => import('./pages/admin/LivePlatformOrganizations').then((m) => ({ default: m.LivePlatformOverview })))
const LiveOrganizationCreate = lazy(() => import('./pages/admin/LivePlatformOrganizations').then((m) => ({ default: m.LiveOrganizationCreate })))
const LivePlatformReports = lazy(() => import('./pages/admin/LivePlatformOrganizations').then((m) => ({ default: m.LivePlatformReports })))
const LivePlatformOrganizationDetail = lazy(() => import('./pages/admin/LivePlatformOrganizationDetail'))
const LivePlatformCourses = lazy(() => import('./pages/admin/LivePlatformCourses'))
const LivePlatformUsers = lazy(() => import('./pages/admin/LivePlatformUsers'))
const LiveVideoReviews = lazy(() => import('./pages/admin/LiveVideoReviews'))
const LiveVideoReviewDetail = lazy(() => import('./pages/admin/LiveVideoReviewDetail'))

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main id="main-content" style={{ maxWidth: 960, margin: '48px auto', padding: '0 16px' }}>
          <LoadingBlock label="Loading page" rows={3} />
        </main>
      }
    >
      {children}
    </Suspense>
  )
}

export function LiveApp({ extraRoutes }: { extraRoutes?: ReactNode }) {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in" element={<Page><LiveSignInPage /></Page>} />
        <Route path="/auth/callback" element={<Page><AuthCallbackPage /></Page>} />
        <Route path="/invite" element={<Page><LiveInvitePage /></Page>} />
        <Route path="/invite/:token" element={<Page><LiveInvitePage /></Page>} />
        <Route path="/catalog" element={<Page><LiveCatalog /></Page>} />
        <Route path="/courses/:courseId" element={<Page><LiveCourseDetail /></Page>} />
        <Route path="/access-denied" element={<LiveAccessDenied />} />
        <Route path="/session-expired" element={<LiveSignInRequired />} />

        <Route element={<RequireSignedIn />}>
          <Route path="/home" element={<HomeRedirect />} />
          <Route path="/learn" element={<Page><LiveLearnerDashboard /></Page>} />
          <Route path="/my-courses" element={<Page><LiveMyCourses /></Page>} />
          <Route path="/profile" element={<Page><LiveProfile /></Page>} />
          <Route path="/learn/courses/:courseId/lessons/:lessonId" element={<Page><LiveLessonPage /></Page>} />
          <Route path="/learn/courses/:courseId/quizzes/:quizId" element={<Page><LiveQuizPage /></Page>} />
          <Route path="/learn/courses/:courseId/complete" element={<Page><LiveCompletion /></Page>} />

          <Route path="/o/:orgSlug/teach" element={<RequireOrgRole roles={['instructor', 'org_admin']} />}>
            <Route index element={<Page><LiveInstructorDashboard /></Page>} />
            <Route path="courses" element={<Page><LiveInstructorCourses /></Page>} />
            <Route path="courses/:courseId" element={<Page><LiveCourseEditor /></Page>} />
            <Route path="courses/:courseId/quizzes/:quizId" element={<Page><LiveQuizBuilder /></Page>} />
            <Route path="learners" element={<Page><LiveTeachLearners /></Page>} />
          </Route>
          <Route path="/o/:orgSlug/manage" element={<RequireOrgRole roles={['org_admin']} />}>
            <Route index element={<Page><LiveOrgAdminDashboard /></Page>} />
            <Route path="members" element={<Page><LiveOrgMembers /></Page>} />
            <Route path="invitations" element={<Page><LiveOrgInvitations /></Page>} />
            <Route path="settings" element={<Page><LiveOrgSettings /></Page>} />
          </Route>
          <Route path="/admin" element={<RequirePlatformAdmin />}>
            <Route index element={<Page><LivePlatformOverview /></Page>} />
            <Route path="organizations" element={<Page><LivePlatformOrganizations /></Page>} />
            <Route path="organizations/new" element={<Page><LiveOrganizationCreate /></Page>} />
            <Route path="organizations/:orgId" element={<Page><LivePlatformOrganizationDetail /></Page>} />
            <Route path="organizations/:orgId/review" element={<Page><LivePlatformOrganizationDetail /></Page>} />
            <Route path="users" element={<Page><LivePlatformUsers /></Page>} />
            <Route path="courses" element={<Page><LivePlatformCourses /></Page>} />
            <Route path="courses/:courseId" element={<Page><LiveCourseEditor /></Page>} />
            <Route path="courses/:courseId/quizzes/:quizId" element={<Page><LiveQuizBuilder /></Page>} />
            <Route path="reports" element={<Page><LivePlatformReports /></Page>} />
            <Route path="video-reviews" element={<Page><LiveVideoReviews /></Page>} />
            <Route path="video-reviews/:submissionId" element={<Page><LiveVideoReviewDetail /></Page>} />
          </Route>
        </Route>

        {extraRoutes}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SessionProvider>
  )
}
