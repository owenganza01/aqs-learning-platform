import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { Badge, ButtonLink, Card, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import styles from './LandingPage.module.css'

/*
 * Public landing page, built from the approved updated design
 * `design-reference/new designs/2 Screens/Landing [Ready].png`
 * (frame 1 = "For learners", frame 2 = "For organizations").
 *
 * Everything here is presentation only: no authentication, no API calls.
 * Hero imagery (D3, still open) and partner logos are placeholders.
 */

// ---------------------------------------------------------------------------
// MOCK CONTENT — sample courses for the layout only. Not real courses, not
// live data. Replace with a course service (D11) when public courses exist.
// ---------------------------------------------------------------------------
type MockCourse = {
  id: string
  title: string
  description: string
  level: 'Beginner' | 'Intermediate'
  duration: string
  instructor: string
}

const MOCK_FEATURED_COURSES: MockCourse[] = [
  {
    id: 'mock-1',
    title: 'Strategic leadership',
    description: 'Build a clear direction, align teams, and make decisions that drive long-term impact.',
    level: 'Intermediate',
    duration: '4h 30m',
    instructor: 'Maya Chen',
  },
  {
    id: 'mock-2',
    title: 'Agile operations',
    description: 'Learn how to plan, prioritize, and deliver work with more speed, clarity, and collaboration.',
    level: 'Beginner',
    duration: '3h 15m',
    instructor: 'Daniel Park',
  },
  {
    id: 'mock-3',
    title: 'Data storytelling',
    description: 'Turn insights into clear recommendations that stakeholders can act on with confidence.',
    level: 'Intermediate',
    duration: '2h 45m',
    instructor: 'Sofia Alvarez',
  },
  {
    id: 'mock-4',
    title: 'Coaching for managers',
    description: 'Help your team grow through better questions, feedback, and everyday conversations.',
    level: 'Intermediate',
    duration: '5h 00m',
    instructor: 'Noah Reed',
  },
  {
    id: 'mock-5',
    title: 'Project planning',
    description: 'Define scope, set realistic timelines, and keep cross-functional work on track.',
    level: 'Beginner',
    duration: '3h 00m',
    instructor: 'Priya Shah',
  },
  {
    id: 'mock-6',
    title: 'Stakeholder engagement',
    description: 'Map audiences, craft a clear message, and build support for your most important initiatives.',
    level: 'Intermediate',
    duration: '4h 15m',
    instructor: 'Elena Brooks',
  },
]
// --------------------------------------------------------------------------- end mock content

type Audience = 'learners' | 'organizations'

/** Copy that changes with the audience selector (frame 1 vs frame 2). */
const HERO_COPY: Record<Audience, { heading: string; lead: string; coursesHeading: string }> = {
  learners: {
    heading: 'Build the skills that move your career forward.',
    lead: 'Practical courses, expert instruction, and flexible pathways help you build capability that lasts.',
    coursesHeading: 'Start with the courses learners are taking right now.',
  },
  organizations: {
    heading: 'Build stronger teams through learning.',
    lead: 'Build team skills, track progress, and recognize achievement with AQS.',
    coursesHeading: 'Start with the courses teams are learning right now.',
  },
}

const STEPS = [
  { title: 'Sign in', text: 'Sign in with Google and learn from any device.' },
  { title: 'Choose a course', text: 'Choose a practical course that fits your goals.' },
  { title: 'Learn and earn a certificate', text: 'Complete lessons and earn your certificate.' },
]

const SUPPORT_FEATURES = [
  { title: 'Progress tracking', text: 'Track your progress and pick up where you left off.' },
  { title: 'Quizzes', text: 'Reinforce key concepts with short knowledge checks.' },
  { title: 'Certificates', text: 'Earn a certificate when you complete a course.' },
  { title: 'Messaging with instructors', text: 'Ask questions and get guidance from your instructor.' },
]

/** Partner logos are not confirmed. These are labelled placeholders, not endorsements. */
const PARTNER_PLACEHOLDERS = ['Partner 1', 'Partner 2', 'Partner 3']

/*
 * Header links point at sections of this page, because /courses and
 * /for-organizations are not built yet. About and Contact keep their planned
 * routes (not built yet — they show the existing Not Found page).
 */
const LANDING_NAV: NavItem[] = [
  { label: 'Courses', to: '#courses' },
  { label: 'For Organizations', to: '#for-organizations' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
]

const THUMBNAIL_TINTS = [styles.tintBlue, styles.tintOrange, styles.tintBlueStrong]

export function LandingPage() {
  const location = useLocation()
  const [audience, setAudience] = useState<Audience>(() =>
    location.hash === '#for-organizations' ? 'organizations' : 'learners',
  )

  // Clicking "For Organizations" in the header also switches the audience.
  // Adjusting state while rendering (instead of in an effect) is React's
  // recommended pattern for reacting to a changed value.
  const [handledLocationKey, setHandledLocationKey] = useState(location.key)
  if (location.key !== handledLocationKey) {
    setHandledLocationKey(location.key)
    if (location.hash === '#for-organizations') setAudience('organizations')
  }

  // React Router does not scroll to #anchors by itself, so do it here and move
  // keyboard focus to the section so the next Tab continues from there.
  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [location.key, location.hash])

  const copy = HERO_COPY[audience]
  const heroTextId = useId()

  return (
    <PublicLayout navItems={LANDING_NAV}>
      {/* ---------------------------------------------------------------- Hero */}
      <section className={styles.hero} id="for-organizations" tabIndex={-1} aria-labelledby={`${heroTextId}-h`}>
        <div className={styles.heroDecor} aria-hidden="true">
          <span className={styles.heroCircle} />
          <span className={styles.heroDot} />
        </div>
        <div className={cx(styles.container, styles.heroInner)}>
          <div className={styles.heroText} id={heroTextId}>
            <div className={styles.audience} role="group" aria-label="Show this page for">
              <button
                type="button"
                className={styles.audienceButton}
                aria-pressed={audience === 'learners'}
                aria-controls={heroTextId}
                onClick={() => setAudience('learners')}
              >
                For learners
              </button>
              <button
                type="button"
                className={styles.audienceButton}
                aria-pressed={audience === 'organizations'}
                aria-controls={heroTextId}
                onClick={() => setAudience('organizations')}
              >
                For organizations
              </button>
            </div>

            <h1 className={cx('text-h1', styles.heroHeading)} id={`${heroTextId}-h`}>
              {copy.heading}
            </h1>
            <p className={cx('text-lead', styles.heroLead)}>{copy.lead}</p>

            {/*
              Hero actions. "Continue with Google" (learners) and "Request a demo"
              (organizations) appear in the design but are hidden until Google
              sign-in and a demo-request flow exist. The organizations view
              therefore has no button yet.
            */}
            {audience === 'learners' ? (
              <div className={styles.heroActions}>
                <ButtonLink to="#courses" iconEnd="arrowRight">
                  Browse courses
                </ButtonLink>
              </div>
            ) : null}
          </div>

          <div className={styles.heroMedia}>
            <span className={styles.heroShape} aria-hidden="true" />
            <div
              className={cx(styles.heroImage, audience === 'organizations' && styles.heroImageSquare)}
              role="img"
              aria-label="Hero image placeholder"
            >
              <span className={styles.placeholderText} aria-hidden="true">
                Hero image placeholder
                <br />
                (pending asset decision D3)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Partners */}
      <section className={styles.partners} aria-label="Partner logos (placeholders, no partners confirmed)">
        <ul className={cx(styles.container, styles.partnerList)}>
          {PARTNER_PLACEHOLDERS.map((name) => (
            <li key={name} className={styles.partner}>
              {name}
              <span className="visually-hidden"> (placeholder)</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------- Featured courses */}
      <section className={styles.section} id="courses" tabIndex={-1} aria-labelledby="courses-heading">
        <div className={styles.container}>
          <p className="eyebrow">Featured courses</p>
          <h2 className={cx('text-h2', styles.sectionHeading, styles.coursesHeading)} id="courses-heading">
            {copy.coursesHeading}
          </h2>
          <p className={cx('text-lead', styles.sectionLead)}>
            From leadership to operations, every course is designed to be practical, flexible, and easy to apply.
          </p>

          <CourseCarousel courses={MOCK_FEATURED_COURSES} />
        </div>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      <section className={cx(styles.section, styles.sectionMuted)} aria-labelledby="steps-heading">
        <div className={styles.container}>
          <p className="eyebrow">How it works</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="steps-heading">
            From sign-in to certificate.
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className={styles.infoCard}>
                  <p className={styles.stepLabel}>Step {index + 1}</p>
                  <h3 className={styles.infoTitle}>{step.title}</h3>
                  <p className={styles.infoText}>{step.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- Support */}
      <section className={cx(styles.section, styles.sectionBordered)} aria-labelledby="support-heading">
        <div className={styles.container}>
          <p className="eyebrow">Why learners stay</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="support-heading">
            Support at every step.
          </h2>
          <ul className={styles.features}>
            {SUPPORT_FEATURES.map((feature) => (
              <li key={feature.title}>
                <Card className={styles.infoCard}>
                  <h3 className={styles.infoTitle}>{feature.title}</h3>
                  <p className={styles.infoText}>{feature.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PublicLayout>
  )
}

/** Single-row carousel: native horizontal scrolling plus previous/next buttons. */
function CourseCarousel({ courses }: { courses: MockCourse[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const labelId = useId()

  const updateButtons = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    setCanPrev(track.scrollLeft > 1)
    setCanNext(track.scrollLeft < maxScroll - 1)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // ResizeObserver fires once on start, then whenever the width changes.
    const observer = new ResizeObserver(updateButtons)
    observer.observe(track)
    return () => observer.disconnect()
  }, [updateButtons])

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current
    const list = listRef.current
    const firstCard = list?.firstElementChild as HTMLElement | null
    if (!track || !list || !firstCard) return
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollBy({ left: direction * (firstCard.offsetWidth + gap), behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <div className={styles.carousel}>
      <div className={styles.carouselHeader}>
        <div>
          <h3 className={styles.carouselTitle} id={labelId}>
            Featured courses
          </h3>
          <p className={styles.carouselMeta}>Explore {courses.length} practical courses</p>
        </div>
        <div className={styles.carouselControls}>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={() => scrollByCard(-1)}
            disabled={!canPrev}
          >
            <Icon name="arrowLeft" label="Previous courses" />
          </button>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={() => scrollByCard(1)}
            disabled={!canNext}
          >
            <Icon name="arrowRight" label="Next courses" />
          </button>
        </div>
      </div>

      {/* Focusable so keyboard users can also scroll it with the arrow keys. */}
      <div
        ref={trackRef}
        className={styles.track}
        onScroll={updateButtons}
        tabIndex={0}
        role="region"
        aria-labelledby={labelId}
      >
        <ul ref={listRef} className={styles.trackList}>
        {courses.map((course, index) => (
          <li key={course.id} className={styles.courseItem}>
            <article className={styles.courseCard}>
              <div className={cx(styles.thumbnail, THUMBNAIL_TINTS[index % THUMBNAIL_TINTS.length])}>
                Thumbnail placeholder
              </div>
              <div className={styles.courseBody}>
                <h4 className={styles.courseTitle}>{course.title}</h4>
                <p className={styles.courseDescription}>{course.description}</p>
                <div className={styles.courseMeta}>
                  <Badge tone={course.level === 'Beginner' ? 'warning' : 'info'}>{course.level}</Badge>
                  <span className={styles.duration}>{course.duration}</span>
                </div>
                <p className={styles.instructor}>Instructor: {course.instructor}</p>
              </div>
            </article>
          </li>
        ))}
        </ul>
      </div>
    </div>
  )
}
