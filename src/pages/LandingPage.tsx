import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { Badge, ButtonLink, Card, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import styles from './LandingPage.module.css'
import { featuredCourses, type CourseSummary } from '../live/data/learning'
import { countOf } from '../lib/plural'
import { LIVE_MODE } from '../live/mode'

/*
 * Public landing page: one page, built from frame 1 of the approved updated design
 * `design-reference/new designs/2 Screens/Landing [Ready].png`. Frame 2 ("For
 * organizations") is not a separate page.
 *
 * CM3-7 (G10, G11; owner instruction 4 November 2026): no invented content is presented as real.
 * The hero image placeholder and the partner logo strip are removed (no owner content yet). The
 * featured section shows real published public courses (live mode) and is not rendered when there
 * are none; the Courses links then go to the catalog. `npm run check:build` fails if the old
 * placeholders or invented courses reach the production build.
 */


const HERO_COPY = {
  heading: 'Build the skills that move your career forward.',
  lead: 'Practical courses, expert instruction, and flexible pathways help you build capability that lasts.',
  coursesHeading: 'Start with the courses learners are taking right now.',
}

/** Pills shown above the hero heading, as in frame 1. Labels only, not controls. */
const HERO_PILLS = ['For learners', 'For organizations']

const STEPS = [
  { title: 'Sign in', text: 'Sign in with Google and learn from any device.' },
  { title: 'Choose a course', text: 'Choose a practical course that fits your goals.' },
  { title: 'Learn and track your progress', text: "Complete lessons and quizzes and see how far you've come." },
]

/* P23 (owner-approved wording, 3 November 2026): features outside the first release (P21) carry a
   "Coming later" label; the approved layout is unchanged. */
const SUPPORT_FEATURES: Array<{ title: string; text: string; comingLater?: boolean }> = [
  { title: 'Progress tracking', text: 'Track your progress and pick up where you left off.' },
  { title: 'Quizzes', text: 'Reinforce key concepts with short knowledge checks.' },
  { title: 'Certificates', text: 'Certificates for completed courses are coming in a later release.', comingLater: true },
  { title: 'Messaging with instructors', text: 'Messaging with instructors is coming in a later release.', comingLater: true },
]


/*
 * Header links point at sections of this page, because /courses and /for-organizations are not
 * built yet. About and Contact come from the shared public navigation (lib/public-navigation.ts).
 */
const navFor = (hasFeatured: boolean): NavItem[] =>
  publicHeaderNav({ courses: hasFeatured ? '#courses' : '/catalog', organizations: '#for-organizations' })

const THUMBNAIL_TINTS = [styles.tintBlue, styles.tintOrange, styles.tintBlueStrong]

export function LandingPage() {
  const location = useLocation()
  // Real published public courses (live mode only; the design preview has no data).
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
  const hasFeatured = featured.length > 0

  // React Router does not scroll to #anchors by itself, so do it here and move
  // keyboard focus to the section so the next Tab continues from there.
  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [location.key, location.hash, hasFeatured])

  const heroHeadingId = useId()

  return (
    <PublicLayout navItems={navFor(hasFeatured)}>
      {/* ---------------------------------------------------------------- Hero */}
      <section className={styles.hero} id="for-organizations" tabIndex={-1} aria-labelledby={heroHeadingId}>
        <div className={styles.heroDecor} aria-hidden="true">
          <HeroNetwork />
          <span className={styles.heroCircle} />
          <span className={styles.heroDot} />
        </div>
        <div className={cx(styles.container, styles.heroInner)}>
          <div className={styles.heroText}>
            <ul className={styles.pills} aria-label="Audiences">
              {HERO_PILLS.map((pill, index) => (
                <li key={pill}>
                  <span className={cx(styles.pill, index === 0 && styles.pillFilled)}>{pill}</span>
                </li>
              ))}
            </ul>

            <h1 className={cx('text-h1', styles.heroHeading)} id={heroHeadingId}>
              {HERO_COPY.heading}
            </h1>
            <p className={cx('text-lead', styles.heroLead)}>{HERO_COPY.lead}</p>

            {/*
              Hero actions. "Continue with Google" and "Request a demo" appear in the
              design but are hidden until Google sign-in and a demo-request flow exist.
            */}
            <div className={styles.heroActions}>
              {LIVE_MODE ? (
                // Live mode has Google sign-in, so the design's sign-in action appears (the demo request does not).
                <ButtonLink to="/sign-in" variant="neutral">
                  Continue with Google
                </ButtonLink>
              ) : null}
              <ButtonLink to={LIVE_MODE || !hasFeatured ? '/catalog' : '#courses'} iconEnd="arrowRight">
                Browse courses
              </ButtonLink>
            </div>
          </div>

        </div>
      </section>

      {/* ---------------------------------------------------- Featured courses */}
      {hasFeatured ? (
      <section className={styles.section} id="courses" tabIndex={-1} aria-labelledby="courses-heading">
        <div className={styles.container}>
          <p className="eyebrow">Featured courses</p>
          <h2 className={cx('text-h2', styles.sectionHeading, styles.coursesHeading)} id="courses-heading">
            {HERO_COPY.coursesHeading}
          </h2>

          <CourseCarousel courses={featured} />
        </div>
      </section>
      ) : null}

      {/* --------------------------------------------------------------- Steps */}
      <section className={cx(styles.section, styles.sectionMuted)} aria-labelledby="steps-heading">
        <div className={styles.container}>
          <p className="eyebrow">How it works</p>
          <h2 className={cx('text-h2', styles.sectionHeading)} id="steps-heading">
            From sign-in to completion.
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
                  {feature.comingLater ? <Badge>Coming later</Badge> : null}
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

/*
 * Faint connected-node network behind the hero (frame 1's background). It drifts
 * slowly; CSS turns the drift off for reduced motion. Decorative only.
 */
const NETWORK_ROWS = [180, 300, 420, 540]
const NETWORK_COLUMNS = [100, 280, 460, 640, 820, 1000, 1180]

function HeroNetwork() {
  const nodes = NETWORK_ROWS.flatMap((y, row) => NETWORK_COLUMNS.map((x, col) => ({ key: `${row}-${col}`, x, y })))
  const segments: { key: string; x1: number; y1: number; x2: number; y2: number }[] = []
  NETWORK_ROWS.forEach((y1, row) =>
    NETWORK_COLUMNS.forEach((x1, col) => {
      const x2 = NETWORK_COLUMNS[col + 1]
      if (x2 === undefined) return
      if ((row + col) % 3 !== 2) segments.push({ key: `h-${row}-${col}`, x1, y1, x2, y2: y1 })
      const y2 = NETWORK_ROWS[row + 1]
      if (y2 !== undefined && col % 2 === 0) segments.push({ key: `d-${row}-${col}`, x1, y1, x2, y2 })
    }),
  )

  return (
    <svg className={styles.heroNetwork} viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" focusable="false">
      <g className={styles.heroNetworkLines}>
        {segments.map((segment) => (
          <line key={segment.key} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} />
        ))}
      </g>
      <g className={styles.heroNetworkNodes}>
        {nodes.map((node) => (
          <circle key={node.key} cx={node.x} cy={node.y} r={4} />
        ))}
      </g>
    </svg>
  )
}

/** Single-row carousel: native horizontal scrolling plus previous/next buttons. */
function CourseCarousel({ courses }: { courses: CourseSummary[] }) {
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
          <p className={styles.carouselMeta}>{countOf(courses.length, 'published course')}</p>
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
              <div className={cx(styles.thumbnail, THUMBNAIL_TINTS[index % THUMBNAIL_TINTS.length])} aria-hidden="true" />
              <div className={styles.courseBody}>
                <h4 className={styles.courseTitle}>{course.title}</h4>
                {course.summary ? <p className={styles.courseDescription}>{course.summary}</p> : null}
                <div className={styles.courseMeta}>
                  <span className={styles.duration}>{countOf(course.lessonCount, 'lesson')}</span>
                </div>
                <ButtonLink to={`/courses/${course.id}`} variant="secondary" size="sm">
                  View course<span className="visually-hidden"> {course.title}</span>
                </ButtonLink>
              </div>
            </article>
          </li>
        ))}
        </ul>
      </div>
    </div>
  )
}
