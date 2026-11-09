import { useParams } from 'react-router'
import { FocusLayout } from '../components/layout/FocusLayout'
import type { CurrentUser } from '../components/layout/types'
import { Banner, ButtonLink, Icon, ProgressBar } from '../components/ui'
import { SAMPLE_COURSE_ID, SAMPLE_COURSE_TITLE } from '../dev/sample-course'
import { NotFound } from './NotFound'
import styles from './CourseCompletionPage.module.css'

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }
const SAMPLE_CATEGORY = 'Data & analytics'

/*
 * Illustrative sample content only (D30). This is a fixed value. It is not computed from any learning
 * activity or quiz, and it is not a claim about the current learner's completion status.
 */
const SAMPLE_COMPLETED_PERCENT = 100

/*
 * Learner course completion preview at /learn/courses/:courseId/complete (D30, provisional frontend
 * approval). Development-only (D27). Based on the Congratulations layout of the fourth frame of the
 * "Course player [Needs review]" board, excluding all certificate features (preview, download,
 * eligibility and issuance). Nothing is saved or calculated here.
 */
export default function CourseCompletionPage() {
  const { courseId = '' } = useParams()

  if (courseId !== SAMPLE_COURSE_ID) return <NotFound />

  return (
    <FocusLayout
      back={{ label: 'My courses', to: '/my-courses' }}
      eyebrow={SAMPLE_CATEGORY}
      title={SAMPLE_COURSE_TITLE}
      titleLevel="h2"
      user={MOCK_LEARNER}
    >
      <div className={styles.wrap}>
        <Banner tone="info">
          Development preview. This is a sample completed state with illustrative content. It does not show your
          progress or any real completion status.
        </Banner>

        <section className={styles.card} aria-labelledby="completion-heading">
          <span className={styles.badge} aria-hidden="true">
            <Icon name="check" size={36} />
          </span>
          <h1 id="completion-heading" className={styles.heading}>
            Congratulations!
          </h1>
          <p className={styles.courseTitle}>{SAMPLE_COURSE_TITLE}</p>
          <p className={styles.lead}>This sample course is complete.</p>

          <div className={styles.summary}>
            <ProgressBar label="Course completed (sample)" value={SAMPLE_COMPLETED_PERCENT} />
          </div>

          <ButtonLink variant="text" to="/learn" className={styles.backLink}>
            Back to dashboard
          </ButtonLink>
        </section>
      </div>
    </FocusLayout>
  )
}
