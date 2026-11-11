import { useId } from 'react'
import { Link } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { ButtonLink, Card } from '../components/ui'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import styles from './GetStartedPage.module.css'

/*
 * Get Started at /get-started (WP2, tasks 2-1 and 2-5): a chooser, not a registration form. Three
 * journeys (owner decision Q8, 8 November 2026): learn on my own, my organisation wants AQS, I was
 * invited. Nothing here creates an account, an organisation or an invitation, and nothing reveals
 * whether an organisation or a person exists. Sign-in stays Google only (D26); invitation tokens
 * stay on their own route (/invite/:token); D33 is explained, not changed.
 * Not designed in Figma: built in the Concept C public layout and card style (research and design
 * report, 10 November 2026, Part D). The three buttons carry equal weight, so all are secondary.
 */

const PATHS = [
  {
    id: 'learn',
    title: 'I want to learn on my own',
    text: 'Browse open courses and enrol. You sign in with a Google account when you enrol.',
    action: 'Find a course',
    to: '/catalog',
  },
  {
    id: 'organization',
    title: 'My organisation wants AQS',
    text: 'Ask AQS for a private workspace to train your staff. AQS reviews every request before setting one up.',
    action: 'Request a workspace',
    to: '/request-workspace',
  },
  {
    id: 'invited',
    title: 'I was invited, or my organisation already uses AQS',
    text: "Open the invitation link in your email, then sign in with the Google account for the email address it was sent to. Your organisation's administrator can send a new link if yours has expired.",
    action: 'Sign in',
    to: '/sign-in',
  },
] as const

export default function GetStartedPage() {
  const headingId = useId()
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <section className={styles.page} aria-labelledby={headingId}>
        <div className={styles.container}>
          <p className={cx('eyebrow', styles.eyebrow)}>Get started</p>
          <h1 className={cx('text-h2', styles.heading)} id={headingId}>
            How would you like to use <span className={styles.name}>AQS E-Learning</span>?
          </h1>
          <p className={cx('text-body', styles.lead)}>Choose the option that fits you. You can always come back.</p>
          <ul className={styles.paths}>
            {PATHS.map((path) => (
              <li key={path.id} className={styles.pathItem}>
                <Card as="section" padding="lg" className={styles.path} aria-labelledby={`path-${path.id}`}>
                  <h2 className={styles.pathTitle} id={`path-${path.id}`}>
                    {path.title}
                  </h2>
                  <p className={styles.pathText}>{path.text}</p>
                  <ButtonLink to={path.to} variant="secondary" fullWidth>
                    {path.action}
                  </ButtonLink>
                </Card>
              </li>
            ))}
          </ul>
          <p className={styles.signIn}>
            Already have an account? <Link to="/sign-in">Sign in</Link>
          </p>
        </div>
      </section>
    </PublicLayout>
  )
}
