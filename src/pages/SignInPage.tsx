import { useId, type ReactNode } from 'react'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Banner, Button } from '../components/ui'
import { cx } from '../lib/cx'
import styles from './SignInPage.module.css'

/*
 * Mock sign-in screen (desktop) — DEVELOPMENT ONLY, registered at /sign-in under
 * import.meta.env.DEV (decision D27). It is presentation only: the Google button is
 * inert and the page makes no sign-in, provider, API, session, token or storage call
 * (decision D15). Real authentication is not approved.
 */

const DEMO_NOTICE = 'Demo only. Sign-in is not available yet. This page makes no sign-in or provider calls.'

/** A footer item without an approved destination (D24): dimmed, not a link, not focusable. */
function UnavailableItem({ children }: { children: ReactNode }) {
  return (
    <span className={styles.unavailable} aria-disabled="true">
      {children}
      <span className="visually-hidden"> (not available yet)</span>
    </span>
  )
}

type SignInViewProps = {
  /** Shown above the heading: the demo disclosure, or a live error. */
  notice?: ReactNode
  onContinue?: () => void
  busy?: boolean
  /** Footer: legal links (live) or unavailable placeholders (demo). */
  footer?: ReactNode
  /**
   * The demo page labels the empty photo panel. The live page shows the panel without any caption
   * (WP1 task 1-2): no placeholder text reaches production until an approved photo exists.
   */
  photoCaption?: boolean
}

/** The approved sign-in layout, shared by the demo page and the live page. */
export function SignInView({ notice, onContinue, busy = false, footer, photoCaption = true }: SignInViewProps) {
  const noticeId = useId()
  return (
    <AuthLayout
      illustration={
        // import.meta.env.DEV is false in production builds, so the caption text is not shipped at all.
        photoCaption && import.meta.env.DEV ? (
          <div className={styles.placeholder}>Hero photo placeholder (pending approved asset)</div>
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )
      }
    >
      {notice ? (
        <div className={styles.notice} id={noticeId}>
          {notice}
        </div>
      ) : null}

      {/* The narrow-screen design uses "Welcome back" (mobile frame, 390 px); desktop keeps "Welcome". */}
      <h1 className={cx('text-h2', styles.heading)}>
        <span className={styles.headingDesktop}>Welcome</span>
        <span className={styles.headingMobile}>Welcome back</span>
      </h1>
      <p className={cx('text-body', styles.lead)}>
        Sign in to continue your courses and pick up right where you left off.
      </p>

      <Button
        variant="neutral"
        fullWidth
        aria-describedby={notice ? noticeId : undefined}
        onClick={onContinue}
        disabled={busy}
      >
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <p className={cx('text-caption', styles.note)}>New here? Signing in with Google creates your learner account.</p>

      {footer ?? (
        <div className={styles.footer}>
          <p className={styles.footerRow}>
            <UnavailableItem>Privacy Policy</UnavailableItem>
            <UnavailableItem>Terms</UnavailableItem>
          </p>
          <p className={cx('text-caption', styles.footerRow)}>
            Want to teach? <UnavailableItem>Learn about teaching.</UnavailableItem>
          </p>
        </div>
      )}
    </AuthLayout>
  )
}

export default function SignInPage() {
  return (
    <SignInView
      notice={
        <Banner tone="info">
          <span>{DEMO_NOTICE}</span>
        </Banner>
      }
    />
  )
}
