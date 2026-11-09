import { useId } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui'
import { cx } from '../lib/cx'
import { HERO_PLACEHOLDER, MockAuthFooter, MockAuthNotice } from './MockAuthParts'
import styles from './MockAuth.module.css'

/*
 * Mock Google sign-up screen — DEVELOPMENT ONLY, registered at /sign-up under
 * import.meta.env.DEV (decision D27). Google-only (decision D15): there is no email or
 * password registration. "Sign up with Google" is inert: it calls no provider, creates no
 * account, issues no token or session, and writes nothing to storage. The "Sign in" link
 * goes to the mock sign-in screen.
 */
export default function SignUpPage() {
  const noticeId = useId()

  return (
    <AuthLayout illustration={<div className={styles.placeholder}>{HERO_PLACEHOLDER}</div>}>
      <MockAuthNotice id={noticeId} />

      <h1 className={cx('text-h2', styles.heading)}>Create your learner account</h1>
      <p className={cx('text-body', styles.lead)}>Use your Google account to start learning with AQS.</p>

      <div className={styles.actions}>
        <Button variant="neutral" fullWidth aria-describedby={noticeId}>
          Sign up with Google
        </Button>
      </div>

      <p className={cx('text-caption', styles.note)}>
        Already have an account?{' '}
        <Link to="/sign-in" className={styles.textLink}>
          Sign in
        </Link>
      </p>

      <MockAuthFooter />
    </AuthLayout>
  )
}
