import { useParams } from 'react-router'
import { FocusLayout } from '../../../components/layout/FocusLayout'
import { Banner, Button, ButtonLink, Icon, ProgressBar } from '../../../components/ui'
import { isIssued } from '../../certificate-model'
import { formatDate } from '../../learner-model'
import styles from '../../../pages/CourseCompletionPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { downloadCertificate, myCertificates } from '../../data/certificates'
import { getCourseDetail, myEnrollmentFor } from '../../data/learning'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Course completion at /learn/courses/:courseId/complete (D30): the Congratulations layout. Shown only
 * when the server has recorded the completion. A11 (0026, 23 November 2026) supersedes D30's and P21's
 * certificate exclusion: when the course's organisation issued a certificate, a Download button (or
 * "being prepared") appears; without a certificate the page shows no certificate wording.
 * A.9: a short summary from what the page already loads (course title, "Completed" with the date the
 * enrolment holds, Back to dashboard). A.2: the course title is the one h1 in both states.
 */
export default function LiveCompletion() {
  const { courseId = '' } = useParams()
  const { me, userId } = useSession()
  const data = useResource(
    async () => {
      const [detail, enrollment] = await Promise.all([getCourseDetail(courseId), myEnrollmentFor(userId ?? '', courseId)])
      if (!detail) return null
      // A11: the certificate for this course, if any (none before 0026 is applied, or never issued).
      // A failed lookup never hides the completion itself.
      const certificate =
        enrollment?.status === 'completed'
          ? ((await myCertificates().catch(() => null)) ?? []).find((c) => c.courseId === courseId) ?? null
          : null
      return { title: detail.course.title, enrollment, certificate }
    },
    `${courseId}:${userId}`,
  )
  const download = useAction((id: string) => downloadCertificate(id))
  const user = { name: me.state === 'ready' && me.data ? me.data.fullName || me.data.email : '', roleLabel: 'Learner' }

  if (data.state === 'loading') return <LoadingBlock label="Loading your result" shape="detail" />
  if (data.state === 'error') return <ErrorBanner error={data.error} onRetry={data.reload} />
  if (!data.data) return <NotFound />
  const completed = data.data.enrollment?.status === 'completed'
  const completedAt = data.data.enrollment?.completedAt ?? null

  return (
    <FocusLayout back={{ label: 'My courses', to: '/my-courses' }} title={data.data.title} titleLevel="h2" user={user}>
      <div className={styles.wrap}>
        {completed ? (
          <section className={styles.card} aria-labelledby="completion-heading">
            <span className={styles.badge} aria-hidden="true">
              <Icon name="check" size={36} />
            </span>
            <p className={styles.lead}>Congratulations!</p>
            <h1 id="completion-heading" className={styles.heading}>
              {data.data.title}
            </h1>
            <p className={styles.courseTitle}>
              {completedAt ? `Completed ${formatDate(completedAt)}` : 'Completed'}
            </p>
            <p className={styles.lead}>You completed every lesson in this course.</p>
            <div className={styles.summary}>
              <ProgressBar label="Course completed" value={100} />
            </div>
            {data.data.certificate ? (
              isIssued(data.data.certificate.status) ? (
                <>
                  <Button iconStart="download" loading={download.busy} onClick={() => void download.run(data.data!.certificate!.id)}>
                    Download certificate
                  </Button>
                  <ActionFeedback error={download.error} />
                </>
              ) : (
                <p className={styles.lead}>
                  Your certificate is being prepared. We'll email it to you, and it will be in{' '}
                  <ButtonLink variant="text" to={`/certificates/${data.data.certificate.id}`}>
                    Certificates
                  </ButtonLink>
                  .
                </p>
              )
            ) : null}
            <ButtonLink variant="text" to="/learn" className={styles.backLink}>
              Back to dashboard
            </ButtonLink>
          </section>
        ) : (
          <>
            <h1 className={styles.heading}>{data.data.title}</h1>
            <Banner tone="info">This course isn't complete yet. Finish every lesson and quiz to complete it.</Banner>
            <ButtonLink variant="text" to={`/courses/${courseId}`} className={styles.backLink}>
              Back to the course
            </ButtonLink>
          </>
        )}
      </div>
    </FocusLayout>
  )
}
