import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../components/layout/AuthLayout'
import { REQUEST_WORKSPACE_AVAILABLE } from '../content/public-site'
import { AUTH_METHOD_ORDER, type AuthMethodId, type OAuthProviderId } from '../lib/auth-methods'
import { cx } from '../lib/cx'
import { EmailSignUpForm, EmailToggle, OrDivider, ProviderButtons } from './auth/AuthOptions'
import { HERO_PLACEHOLDER, MockAuthFooter, MockAuthNotice } from './MockAuthParts'
import styles from './MockAuth.module.css'

/*
 * Sign-up layout (D42, 12 November 2026), shared by the live sign-up page
 * (live/pages/LiveSignUpPage.tsx) and the mock sign-up screen — DEVELOPMENT ONLY, registered at
 * /sign-up under import.meta.env.DEV (decision D27). Options: Continue with Google, Apple or
 * Facebook (the first sign-in creates the learner account), or Sign up with Email. The mock shows
 * every option but calls no provider, creates no account and writes nothing.
 *
 * Every new account is a learner account with no organization (F1). Organizations get a workspace
 * through AQS, not through this page: the link below explains how.
 */

/** Where people who want a workspace for their organization are sent. */
const ORGANIZATIONS_PATH = REQUEST_WORKSPACE_AVAILABLE ? '/request-workspace' : '/#organizations'

type SignUpViewProps = {
  notice?: ReactNode
  methods?: AuthMethodId[]
  onProvider?: (provider: OAuthProviderId) => void
  onEmailSignUp?: (values: { fullName: string; email: string; password: string }) => void
  busy?: AuthMethodId | null
  inert?: boolean
  /** Set after an email sign-up that needs its address confirmed: the form is replaced by this message. */
  confirmationSentTo?: string | null
  /** Where "Sign in" leads, keeping the return path. */
  signInTo?: string
  footer?: ReactNode
  /** The navy side's content: a photo, or the placeholder until its photo is placed. */
  illustration?: ReactNode
}

export function SignUpView({
  notice,
  methods = ['google'],
  onProvider,
  onEmailSignUp,
  busy = null,
  inert = false,
  confirmationSentTo = null,
  signInTo = '/sign-in',
  footer,
  illustration,
}: SignUpViewProps) {
  const noticeId = useId()
  const emailFormId = useId()
  const [emailOpen, setEmailOpen] = useState(false)
  const confirmationRef = useRef<HTMLHeadingElement>(null)

  // After sign-up, focus the confirmation message so screen readers announce it.
  useEffect(() => {
    if (confirmationSentTo) confirmationRef.current?.focus()
  }, [confirmationSentTo])

  return (
    <AuthLayout illustration={illustration ?? <div className={styles.placeholder} aria-hidden="true" />}>
      {notice ? (
        <div className={styles.notice} id={noticeId}>
          {notice}
        </div>
      ) : null}

      {confirmationSentTo ? (
        <div role="status">
          <h1 className={cx('text-h2', styles.heading)} tabIndex={-1} ref={confirmationRef}>
            Check your email
          </h1>
          <p className={cx('text-body', styles.lead)}>
            We sent a link to <strong>{confirmationSentTo}</strong>. Open it to confirm your address and finish creating
            your account.
          </p>
          <p className={cx('text-caption', styles.note)}>
            Nothing arrived after a few minutes? Check your spam folder, or{' '}
            <Link to={signInTo} className={styles.textLink}>
              go back to sign in
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <h1 className={cx('text-h2', styles.heading)}>Create your learner account</h1>
          <p className={cx('text-body', styles.lead)}>Choose how you want to sign in to AQS. It's free.</p>

          <ProviderButtons
            methods={methods}
            onProvider={inert ? undefined : onProvider}
            busyProvider={busy && busy !== 'email' ? busy : null}
            disabled={busy !== null}
            describedBy={notice ? noticeId : undefined}
          />

          {methods.includes('email') ? (
            <>
              <OrDivider />
              <EmailToggle
                label="Sign up with Email"
                open={emailOpen}
                onToggle={() => setEmailOpen((open) => !open)}
                controls={emailFormId}
                disabled={busy !== null && busy !== 'email'}
              />
              {emailOpen ? (
                <EmailSignUpForm id={emailFormId} inert={inert} busy={busy === 'email'} autoFocus onSubmit={onEmailSignUp} />
              ) : null}
            </>
          ) : null}

          <p className={cx('text-caption', styles.note)}>
            Already have an account?{' '}
            <Link to={signInTo} className={styles.textLink}>
              Sign in
            </Link>
          </p>
          <p className={cx('text-caption', styles.note)}>
            Setting up training for a team?{' '}
            <Link to={ORGANIZATIONS_PATH} className={styles.textLink}>
              See how organizations get started
            </Link>
          </p>
        </>
      )}

      {footer ?? <MockAuthFooter />}
    </AuthLayout>
  )
}

export default function SignUpPage() {
  const noticeId = useId()
  return (
    <SignUpView
      inert
      methods={AUTH_METHOD_ORDER.slice()}
      notice={<MockAuthNotice id={noticeId} />}
      illustration={<div className={styles.placeholder}>{import.meta.env.DEV ? HERO_PLACEHOLDER : null}</div>}
    />
  )
}
