import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AuthLayout, AuthPhotoImage } from '../components/layout/AuthLayout'
import { AUTH_PHOTOS } from '../components/layout/auth-photos'
import { Banner } from '../components/ui'
import { AUTH_METHOD_ORDER, type AuthMethodId, type OAuthProviderId } from '../lib/auth-methods'
import { cx } from '../lib/cx'
import { EmailSignInForm, EmailToggle, OrDivider, ProviderButtons } from './auth/AuthOptions'
import styles from './SignInPage.module.css'

/*
 * Sign-in layout shared by the live sign-in page (live/pages/LiveSignInPage.tsx) and the mock
 * sign-in screen — DEVELOPMENT ONLY, registered at /sign-in under import.meta.env.DEV (decision
 * D27). The mock shows every method of D42 (Google, Apple, Facebook, email).
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
  /** Sign-in methods to offer, in display order (lib/auth-methods.ts). */
  methods?: AuthMethodId[]
  /** Called with the OAuth provider chosen. Omitted in the inert demo. */
  onProvider?: (provider: OAuthProviderId) => void
  /** Called with the email form's checked values. Omitted in the inert demo. */
  onEmailSignIn?: (values: { email: string; password: string }) => void
  /** The provider whose sign-in is opening, or 'email' while the email sign-in runs. */
  busy?: AuthMethodId | null
  /** Development preview (D27): every control is shown but does nothing. */
  inert?: boolean
  /** Where "Create an account" leads (the sign-up page), keeping the return path. */
  signUpTo?: string
  /** Footer: legal links (live) or unavailable placeholders (demo). */
  footer?: ReactNode
  /** Starts with the email form expanded. */
  defaultEmailOpen?: boolean
}

/** The approved sign-in layout, shared by the demo page and the live page. */
export function SignInView({
  notice,
  methods = ['google'],
  onProvider,
  onEmailSignIn,
  busy = null,
  inert = false,
  signUpTo = '/sign-up',
  footer,
  defaultEmailOpen = false,
}: SignInViewProps) {
  const noticeId = useId()
  const emailFormId = useId()
  const [emailOpen, setEmailOpen] = useState(defaultEmailOpen)
  const offersEmail = methods.includes('email')

  return (
    <AuthLayout illustration={<AuthPhotoImage photo={AUTH_PHOTOS.learnerVideoCall} />}>
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

      {offersEmail ? (
        <>
          <EmailToggle
            label="Sign in with Email"
            open={emailOpen}
            onToggle={() => setEmailOpen((open) => !open)}
            controls={emailFormId}
            disabled={busy !== null && busy !== 'email'}
          />
          {emailOpen ? (
            <EmailSignInForm id={emailFormId} inert={inert} busy={busy === 'email'} autoFocus onSubmit={onEmailSignIn} />
          ) : null}
          <OrDivider />
        </>
      ) : null}

      <ProviderButtons
        methods={methods}
        onProvider={inert ? undefined : onProvider}
        busyProvider={busy && busy !== 'email' ? busy : null}
        disabled={busy !== null}
        describedBy={notice ? noticeId : undefined}
      />

      <p className={cx('text-caption', styles.note)}>
        New here?{' '}
        <Link to={signUpTo} className={styles.textLink}>
          Create an account
        </Link>
      </p>

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
      inert
      methods={AUTH_METHOD_ORDER.slice()}
      notice={
        <Banner tone="info">
          <span>{DEMO_NOTICE}</span>
        </Banner>
      }
    />
  )
}
