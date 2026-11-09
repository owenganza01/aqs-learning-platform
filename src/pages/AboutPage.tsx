import { PublicLayout } from '../components/layout/PublicLayout'
import { Banner, ButtonLink, Card } from '../components/ui'
import { publicHeaderNav } from '../lib/public-navigation'
import styles from './PublicInfoPages.module.css'

/*
 * About page at /about — DEVELOPMENT ONLY (D27; authorised for the application 26 October 2026).
 *
 * No design exists for this page (design audit: "no About or Contact page"), so it uses the public
 * layout, type scale and card style of the landing page.
 *
 * Content rule: only information AQS has already given the project is stated as fact. That is the
 * product description in the Project (who the platform serves and how organizations are kept apart)
 * and the approved landing copy. The company description, history, full legal name and location
 * are not supplied, so they are a labelled placeholder. The project documents spell the company name
 * two ways ("Africa" and "African" Quantitative Sciences), so the page uses "AQS" until AQS confirms.
 * No certificate, messaging or offline claim is made, because those features are deferred.
 */
export default function AboutPage() {
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.intro}>
            <p className="eyebrow">About</p>
            <h1 className={styles.title}>About AQS E-Learning</h1>
            <p className={styles.lead}>
              Practical courses, expert instruction, and flexible pathways for individuals and teams.
            </p>
          </header>

          <div className={styles.grid}>
            <Card padding="lg" as="section" aria-labelledby="about-platform" className={styles.card}>
              <h2 id="about-platform" className={styles.heading}>
                One platform, two ways to learn
              </h2>
              <p>AQS E-Learning is a learning platform owned and operated by AQS. It serves:</p>
              <ul className={styles.list}>
                <li>organizations that need a private training environment for their employees;</li>
                <li>individuals who want to take courses that are open to the public.</li>
              </ul>
            </Card>

            <Card padding="lg" as="section" aria-labelledby="about-organizations" className={styles.card}>
              <h2 id="about-organizations" className={styles.heading}>
                For organizations
              </h2>
              <p>
                Each organization has its own learning environment. Its courses, learners, administrators and learning
                records are kept separate from every other organization's.
              </p>
              <p>
                AQS sets up an organization's environment with the administrators the organization nominates. They then
                invite the instructors who prepare its courses.
              </p>
            </Card>

            <Card padding="lg" as="section" aria-labelledby="about-learners" className={styles.card}>
              <h2 id="about-learners" className={styles.heading}>
                For learners
              </h2>
              <p>
                Choose a course, work through its lessons, check what you have learned with short quizzes, and pick up
                where you left off.
              </p>
              <ButtonLink to="/#courses" variant="text" iconEnd="arrowRight">
                See the courses
              </ButtonLink>
            </Card>
          </div>

          <section aria-labelledby="about-company" className={styles.placeholderSection}>
            <h2 id="about-company" className={styles.heading}>
              About AQS
            </h2>
            <Banner tone="warning">
              Development placeholder: AQS has not supplied its company description, history, full legal name or
              location yet. They will be added here once AQS confirms them.
            </Banner>
          </section>

          <div className={styles.ctaRow}>
            <ButtonLink to="/contact" variant="secondary">
              Contact AQS
            </ButtonLink>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
