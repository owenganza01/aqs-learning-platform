import { PublicLayout } from '../components/layout/PublicLayout'
import { ButtonLink } from '../components/ui'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import { ABOUT_CONTENT } from '../content/public-site'
import styles from './PublicInfoPages.module.css'

export default function AboutPage() {
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <section className={styles.intro} aria-labelledby="about-title">
        <div className={styles.container}>
          <p className="eyebrow">About AQS</p>
          <h1 className={cx('text-h1', styles.title)} id="about-title">
            About AQS
          </h1>
          <div className={styles.introBody}>
            {ABOUT_CONTENT.ownershipLine ? <p className={styles.lead}>{ABOUT_CONTENT.ownershipLine}</p> : null}
            {ABOUT_CONTENT.introduction ? <p className={styles.lead}>{ABOUT_CONTENT.introduction}</p> : null}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-label="Mission and purpose">
        <div className={cx(styles.container, styles.twoColumns)}>
          <div className={styles.block}>
            <h2 className={styles.heading}>Our mission</h2>
            {ABOUT_CONTENT.mission ? <p>{ABOUT_CONTENT.mission}</p> : null}
          </div>
          <div className={styles.block}>
            <h2 className={styles.heading}>Why we built AQS E-Learning</h2>
            {ABOUT_CONTENT.purpose ? <p>{ABOUT_CONTENT.purpose}</p> : null}
          </div>
        </div>
      </section>

      <section className={cx(styles.section, styles.muted)} aria-labelledby="about-offers">
        <div className={styles.container}>
          <p className="eyebrow">What the platform offers</p>
          <h2 className={cx('text-h2', styles.sectionTitle)} id="about-offers">
            Training for your organization. Courses for everyone.
          </h2>
          <p className={styles.sectionLead}>
            AQS E-Learning gives each organization its own workspace to train its staff, and gives anyone open courses to
            learn from, with one account.
          </p>
        </div>
      </section>

      <section className={cx(styles.section, styles.closing)} aria-labelledby="about-questions">
        <div className={styles.container}>
          <h2 className={cx('text-h2', styles.sectionTitle)} id="about-questions">
            Questions about AQS?
          </h2>
          <div className={styles.actions}>
            <ButtonLink to="/contact">Contact AQS</ButtonLink>
            <ButtonLink to="/catalog" variant="secondary">
              Find a course
            </ButtonLink>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
