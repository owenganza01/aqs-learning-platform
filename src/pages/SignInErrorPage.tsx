import { useId } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui'
import { cx } from '../lib/cx'
import { HERO_PLACEHOLDER, MockAuthFooter, MockAuthNotice } from './MockAuthParts'
import styles from './MockAuth.module.css'

/*
 * Mock sign-in error screen — DEVELOPMENT ONLY, registered at /sign-in/error under
 * import.meta.env.DEV (decision D27). It describes no real error: there is no provider
 * response, error code or technical cause. "Try again" is inert and "Contact support" is
 * unavailable (D24). The page makes no sign-in or provider call (decision D15).
 */
export default function SignInErrorPage() {
  const noticeId = useId()

  return (
    <AuthLayout illustration={<div className={styles.placeholder}>{HERO_PLACEHOLDER}</div>}>
      <MockAuthNotice id={noticeId} />

      <h1 className={cx('text-h2', styles.heading)}>We couldn't sign you in</h1>
      <p className={cx('text-body', styles.lead)}>Please try again</p>

      <div className={styles.actions}>
        <Button variant="neutral" fullWidth aria-describedby={noticeId}>
          Try again
        </Button>
        {/* Unavailable (D24): disabled, not focusable, and announced as "not available yet". */}
        <Button variant="neutral" fullWidth disabled>
          Contact support
          <span className="visually-hidden"> (not available yet)</span>
        </Button>
      </div>

      {/* Approved exception to the inert "Try again" rule: a link back to the mock sign-in screen. */}
      <p className={cx('text-caption', styles.note)}>
        <Link to="/sign-in" className={styles.textLink}>
          Back to sign in
        </Link>
      </p>

      <MockAuthFooter />
    </AuthLayout>
  )
}
