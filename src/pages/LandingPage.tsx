import { useEffect, useId, useState } from 'react'
import { Link, useLocation, useNavigationType } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { ButtonLink } from '../components/ui'
import { cx } from '../lib/cx'
import { countOf } from '../lib/plural'
import { publicHeaderNav } from '../lib/public-navigation'
import { featuredCourses, type CourseSummary } from '../live/data/learning'
import { LIVE_MODE } from '../live/mode'
import {
  claimCleared,
  REQUEST_WORKSPACE_AVAILABLE,
  type PublicClaimId,
} from '../content/public-site'
import { HeroNetwork } from './landing/HeroNetwork'
import styles from './LandingPage.module.css'

/*
 * Public landing page: Concept C, "Two doors, one platform" (approved by the owner on 10 November
 * 2026; landing page proposal, Revision 2 and its About/Contact amendment).
 *
 * Owner restrictions applied here:
 * - Primary buttons are action blue (#1D4ED8), approved by the owner on 10 November 2026 (D41); the
 *   colour comes from the shared --color-action token, so it is the same on every page.
 * - The connected-dots network stays behind the hero and is animated (owner correction, 10 November
 *   2026; see landing/HeroNetwork.tsx). It is decorative and still for reduced motion.
 * - Only statements cleared in content/public-site.ts are shown (no unverified security, privacy or
 *   capability claims). The "Private organization workspaces" block is therefore not rendered yet.
 * - The hero product visual area is kept as an image placeholder ready for asset selection.
 * - The page has no About AQS block (removed at the client's request, 11 November 2026); the header's
 *   About link opens the About AQS page instead.
 * - The For organizations band uses the page's light palette (client request, 11 November 2026).
 */

const HERO_COPY = {
  heading: 'Training for your organization. Courses for everyone.',
  lead: 'AQS E-Learning gives each organization its own workspace to train its staff, and gives anyone open courses to learn from, with one account.',
}

const COURSES_HEADING = 'Build the skills that move your career forward.'

/** "For organizations" items; each is shown only once its statement is cleared. */
const ORGANIZATION_FACTS: Array<{ claim: PublicClaimId; title: string; text: string }> = [
  { claim: 'C5', title: 'Assign and track', text: "Assign courses with due dates and see each person's progress and what is overdue." },
  { claim: 'C4', title: 'Invite your people', text: 'Invite instructors and staff by link. Invitations expire after seven days and can be withdrawn.' },
  { claim: 'C2', title: 'Publish your own courses', text: 'Your instructors build courses; a second person approves each one before it is published.' },
]

/** Organization onboarding as decided for the platform (D4: AQS creates each organization). */
const SETUP_STEPS = [
  'Tell us about your organization',
  'AQS reviews your request and sets up your workspace',
  'Your admins invite instructors and staff',
  'Publish courses and assign them',
]

/** "Private organization workspaces" statements (C1, C3). The block appears only when both are cleared. */
const PRIVACY_STATEMENTS: Array<{ claim: PublicClaimId; title: string; text: string }> = [
  {
    claim: 'C1',
    title: 'Kept in its own workspace',
    text: "Each organization's courses, learners and results are kept in its own workspace, and access is checked on the server for every request.",
  },
  { claim: 'C3', title: 'Sign in with Google', text: 'Sign in with your Google account.' },
]

/*
 * "Learning on AQS". Lessons is statement C7 (cleared). Quizzes and Progress keep the wording the
 * owner approved for this page on 3 November 2026 (P23). Quiz marking (C6) and due dates (C5) wait
 * for their checks.
 */
const LEARNING_ITEMS: Array<{ title: string; text: string; claim?: PublicClaimId }> = [
  { title: 'Lessons', text: 'Video and reading lessons, with files to download when the instructor allows it.', claim: 'C7' },
  { title: 'Quizzes', text: 'Reinforce key concepts with short knowledge checks.' },
  { title: 'Progress', text: 'Track your progress and pick up where you left off.' },
  { title: 'Due dates', text: 'Courses your organization assigns show what is due and what is overdue.', claim: 'C5' },
]

const THUMBNAIL_TINTS = [styles.tintBlue, styles.tintOrange, styles.tintNavy]

const cleared = <T extends { claim?: PublicClaimId }>(items: T[]) => items.filter((item) => !item.claim || claimCleared(item.claim))

export function LandingPage() {
  const location = useLocation()
  // Real published public courses (live mode only; the design preview has no course data).
  const [featured, setFeatured] = useState<CourseSummary[]>([])
  useEffect(() => {
    if (!LIVE_MODE) return
    let current = true
    featuredCourses().then(
      (rows) => current && setFeatured(rows),
      () => current && setFeatured([]),
    )
    return () => {
      current = false
    }
  }, [])

  const navigationType = useNavigationType()

  // React Router does not scroll to #anchors by itself, so do it here and move
  // keyboard focus to the section so the next Tab continues from there.
  // Without a hash, a link to this page (not Back or Forward) opens it at the top instead of at
  // the previous page's scroll position. The header's Home link scrolls smoothly when the visitor
  // is already here, and moves focus to the main content so the next Tab starts from the top.
  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1))
      if (!target) return
      target.scrollIntoView({ block: 'start' })
      target.focus({ preventScroll: true })
      return
    }
    if (navigationType === 'POP') return
    const homeTop = (location.state as { homeTop?: boolean } | null)?.homeTop === true
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: homeTop && !reduceMotion ? 'smooth' : 'auto' })
    if (homeTop) document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [location.key, location.hash, location.state, navigationType])

  const heroHeadingId = useId()
  const organizationFacts = cleared(ORGANIZATION_FACTS)
  const privacyStatements = cleared(PRIVACY_STATEMENTS)
  const showPrivacyBlock = privacyStatements.length === PRIVACY_STATEMENTS.length
  const learningItems = cleared(LEARNING_ITEMS)

  const shownCourses = featured.slice(0, 3)

  return (
    <PublicLayout navItems={publicHeaderNav()}>
      {/* ---------------------------------------------------------------- Hero */}
      <section className={styles.hero} aria-labelledby={heroHeadingId}>
        <HeroNetwork />
        <div className={cx(styles.container, styles.heroInner)}>
          <div className={styles.heroText}>
            <h1 className={cx('text-h1', styles.heroHeading)} id={heroHeadingId}>
              {HERO_COPY.heading}
            </h1>
            <p className={cx('text-lead', styles.heroLead)}>{HERO_COPY.lead}</p>
            <ul className={styles.doors}>
              <li className={styles.door}>
                <h2 className={styles.doorTitle}>I want to learn</h2>
                <p className={styles.doorText}>Browse public courses and enroll.</p>
                <ButtonLink to="/catalog" variant="secondary" fullWidth>
                  Find a course
                </ButtonLink>
              </li>
              <li className={styles.door}>
                <h2 className={styles.doorTitle}>I&apos;m training a team</h2>
                <p className={styles.doorText}>A workspace for your organization&apos;s staff.</p>
                <ButtonLink to="/#organizations" fullWidth>
                  Set up training
                </ButtonLink>
              </li>
            </ul>
            <p className={styles.invited}>
              Invited by your organization?{' '}
              <Link to="/sign-in">Sign in</Link> with the email address the invitation was sent to.
            </p>
          </div>
          <figure className={styles.heroMedia}>
            <div
              className={styles.heroPlaceholder}
              role="img"
              aria-label="The learner dashboard: a welcome message, and a course to continue with its progress bar and an overdue due date."
            >
              <div className={styles.heroPlaceholderCard}>
                <span className={styles.heroPlaceholderBadge}>Image Placeholder</span>
                <p className={styles.heroPlaceholderTitle}>Learner dashboard preview</p>
                <p className={styles.heroPlaceholderHint}>Image placeholder — asset selection pending.</p>
              </div>
            </div>
            <figcaption className={styles.heroCaption}>The learner dashboard, shown with sample data.</figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------------- Courses */}
      <section className={styles.section} id="courses" tabIndex={-1} aria-labelledby="courses-heading">
        <div className={styles.container}>
          <p className="eyebrow">Courses</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="courses-heading">
            {COURSES_HEADING}
          </h2>
          {shownCourses.length > 0 ? (
            <>
              <ul className={styles.courseGrid} aria-label="Featured courses">
                {shownCourses.map((course, index) => (
                  <li key={course.id}>
                    <article className={styles.courseCard}>
                      <div className={cx(styles.thumbnail, THUMBNAIL_TINTS[index % THUMBNAIL_TINTS.length])} aria-hidden="true" />
                      <div className={styles.courseBody}>
                        <h3 className={styles.courseTitle}>{course.title}</h3>
                        {course.summary ? <p className={styles.courseDescription}>{course.summary}</p> : null}
                        <p className={styles.courseMeta}>{countOf(course.lessonCount, 'lesson')}</p>
                        <ButtonLink to={`/courses/${course.id}`} variant="secondary" size="sm">
                          View course<span className="visually-hidden"> {course.title}</span>
                        </ButtonLink>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
              <p className={styles.moreLink}>
                <ButtonLink to="/catalog" variant="text" iconEnd="arrowRight">
                  See all courses
                </ButtonLink>
              </p>
            </>
          ) : (
            // Neutral empty state, in the catalog page's own words: no launch date is promised.
            <div className={styles.emptyCourses}>
              <h3 className={styles.emptyTitle}>No courses yet</h3>
              <p>New courses will appear here when they are published.</p>
              <p className={styles.emptyHint}>
                Courses assigned by your organization are in your workspace after you{' '}
                <Link to="/sign-in">sign in</Link>.
              </p>
              <p style={{ marginTop: 'var(--space-16)' }}>
                <ButtonLink to="/catalog" variant="secondary">
                  Browse sample course catalog
                </ButtonLink>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------- For organizations */}
      <section
        className={cx(styles.section, styles.organizations)}
        id="organizations"
        tabIndex={-1}
        aria-labelledby="organizations-heading"
      >
        <div className={styles.container}>
          <p className="eyebrow">For organizations</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="organizations-heading">
            Train your staff in your organization&apos;s own workspace.
          </h2>
          {organizationFacts.length > 0 ? (
            <ul className={styles.facts}>
              {organizationFacts.map((fact) => (
                <li key={fact.title} className={styles.fact}>
                  <h3 className={styles.factTitle}>{fact.title}</h3>
                  <p>{fact.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <h3 className={styles.stepsHeading}>How setting up works</h3>
          <ol className={styles.steps}>
            {SETUP_STEPS.map((step, index) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          {REQUEST_WORKSPACE_AVAILABLE ? (
            /* Step 1 starts here (WP3, task 3-3). On navy the primary button uses its inverse style (D41). */
            <div className={cx('on-dark', styles.organizationsAction)}>
              <ButtonLink to="/request-workspace">Request a workspace</ButtonLink>
              <p>AQS reviews every request. Nothing is set up until we have checked it with you.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* -------------------------------------- Private organization workspaces */}
      {showPrivacyBlock ? (
        <section className={cx(styles.section, styles.sectionMuted)} aria-labelledby="privacy-heading">
          <div className={cx(styles.container, styles.split)}>
            <div>
              <p className="eyebrow">Private organization workspaces</p>
              <h2 className={cx('text-h2', styles.sectionHeading)} id="privacy-heading">
                Built to keep each organization&apos;s training separate.
              </h2>
            </div>
            <ul className={styles.statements}>
              {privacyStatements.map((statement) => (
                <li key={statement.title} className={styles.statement}>
                  <h3 className={styles.itemTitle}>{statement.title}</h3>
                  <p>{statement.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------ Learning on AQS */}
      <section className={styles.section} aria-labelledby="learning-heading">
        <div className={styles.container}>
          <p className="eyebrow">Learning on AQS</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="learning-heading">
            What a course on AQS includes.
          </h2>
          <ul className={styles.learning}>
            {learningItems.map((item) => (
              <li key={item.title}>
                <h3 className={styles.itemTitle}>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- Closing */}
      <section className={cx(styles.section, styles.closing)} aria-labelledby="closing-heading">
        <div className={styles.container}>
          <h2 className={cx('text-h2', styles.closingHeading)} id="closing-heading">
            Ready when you are.
          </h2>
          <div className={styles.closingActions}>
            <ButtonLink to="/get-started">Get started</ButtonLink>
            <ButtonLink to="/catalog" variant="secondary">
              Find a course
            </ButtonLink>
            <ButtonLink to="/#organizations" variant="neutral">Set up training for your team</ButtonLink>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
