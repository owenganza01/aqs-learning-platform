import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Banner } from '../../components/ui'
import { useAuth } from '../../lib/auth-context'
import { SIGN_IN_NOT_CONFIGURED, SIGN_IN_PROBLEM_MESSAGES, friendlyAuthError, signInProblemFromQuery } from '../../lib/auth-errors'
import { OAUTH_PROVIDER_LABELS, parseAuthMethods, type AuthMethodId } from '../../lib/auth-methods'
import { SignInView } from '../../pages/SignInPage'
import { safeNext } from '../safe-next'
import { LegalFooter } from '../components/LegalFooter'

/** Methods switched on for this deployment (VITE_AUTH_PROVIDERS; Google is always on). */
const METHODS = parseAuthMethods(import.meta.env.VITE_AUTH_PROVIDERS ?? 'google,apple,facebook,email')

/*
 * Live sign-in (D15, D42): Google, and Apple, Facebook and email where switched on. New people get
 * a learner account on their first OAuth sign-in (F1, P13); email accounts are created on the
 * sign-up page. After sign-in the person returns to `next` (same-site paths only).
 */
export default function LiveSignInPage() {
  const { session, signInWithProvider, signInWithEmail, authAvailable } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState<AuthMethodId | null>(null)
  // Task 2-4: the reason a previous attempt came back (cancelled, expired or failed), from /auth/callback.
  const returned = signInProblemFromQuery(params.get('error'))
  const [error, setError] = useState<{ tone: 'info' | 'danger'; text: string } | null>(
    returned ? SIGN_IN_PROBLEM_MESSAGES[returned] : null,
  )

  if (session) return <Navigate to={next} replace />

  const query = next === '/home' ? '' : `?next=${encodeURIComponent(next)}`

  return (
    <SignInView
      methods={METHODS}
      busy={busy}
      signUpTo={`/sign-up${query}`}
      notice={
        !authAvailable ? (
          <Banner tone="warning">{SIGN_IN_NOT_CONFIGURED}</Banner>
        ) : error ? (
          // A danger banner is announced at once (role="alert"); a cancelled sign-in is information.
          <Banner tone={error.tone}>{error.text}</Banner>
        ) : undefined
      }
      onProvider={async (provider) => {
        if (provider === 'apple' || provider === 'facebook') {
          setError({
            tone: 'info',
            text: `${OAUTH_PROVIDER_LABELS[provider]} sign-in is coming soon. Please continue with Email or Google.`,
          })
          return
        }
        setBusy(provider)
        setError(null)
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        const result = await signInWithProvider(provider, { redirectTo })
        // On success the browser is leaving for the provider; only a failure comes back here.
        if (result.error) {
          setError({ tone: 'danger', text: friendlyAuthError(result.code, 'provider') })
          setBusy(null)
        }
      }}
      onEmailSignIn={async ({ email, password }) => {
        setBusy('email')
        setError(null)
        const result = await signInWithEmail({ email, password })
        // Success: the auth listener sets the session and this page redirects to `next`.
        if (result.error) setError({ tone: 'danger', text: friendlyAuthError(result.code, 'sign-in') })
        setBusy(null)
      }}
      footer={<LegalFooter />}
    />
  )
}
