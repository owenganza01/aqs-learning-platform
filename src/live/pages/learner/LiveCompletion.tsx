import { useParams } from 'react-router'
import { FocusLayout } from '../../../components/layout/FocusLayout'
import { Banner, ButtonLink, Icon, ProgressBar } from '../../../components/ui'
import styles from '../../../pages/CourseCompletionPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { getCourseDetail, myEnrollmentFor } from '../../data/learning'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'

/*
 * Course completion at /learn/courses/:courseId/complete (D30): the Congratulations layout,
 * without certificate features (P21). Shown only when the server has recorded the completion.
 */
export default function LiveCompletion() {
  const { courseId = '' } = useParams()
  const { me, userId } = useSession()
  const data = useResource(
    async () => {
      const [detail, enrollment] = await Promise.all([getCourseDetail(courseId), myEnrollmentFor(userId ?? '', courseId)])
      return detail ? { title: detail.course.title, enrollment } : null
    },
    `${courseId}:${userId}`,
  )
  const user = { name: me.state === 'ready' && me.data ? me.data.fullName || me.data.email : '', roleLabel: 'Learner' }

  if (data.state === 'loading') return <LoadingBlock label="Loading" />
  if (data.state === 'error') return <ErrorBanner error={data.error} onRetry={data.reload} />
  if (!data.data) return <NotFound />
  const completed = data.data.enrollment?.status === 'completed'

  return (
    <FocusLayout back={{ label: 'My courses', to: '/my-courses' }} title={data.data.title} titleLevel="h2" user={user}>
      <div className={styles.wrap}>
        {completed ? (
          <section className={styles.card} aria-labelledby="completion-heading">
            <span className={styles.badge} aria-hidden="true">
              <Icon name="check" size={36} />
            </span>
            <h1 id="completion-heading" className={styles.heading}>
              Congratulations!
            </h1>
            <p className={styles.courseTitle}>{data.data.title}</p>
            <p className={styles.lead}>You completed every lesson in this course.</p>
            <div className={styles.summary}>
              <ProgressBar label="Course completed" value={100} />
            </div>
            <ButtonLink variant="text" to="/learn" className={styles.backLink}>
              Back to dashboard
            </ButtonLink>
          </section>
        ) : (
          <>
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
