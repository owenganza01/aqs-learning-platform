import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Banner } from '../../components/ui'
import { useAuth } from '../../lib/auth-context'
import { friendlyAuthError } from '../../lib/auth-errors'
import { parseAuthMethods, type AuthMethodId } from '../../lib/auth-methods'
import { SignInView } from '../../pages/SignInPage'
import { safeNext } from '../safe-next'
import { LegalFooter } from '../components/LegalFooter'

/** Methods switched on for this deployment (VITE_AUTH_PROVIDERS; Google is always on). */
const METHODS = parseAuthMethods(import.meta.env.VITE_AUTH_PROVIDERS)

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
  const [error, setError] = useState<string | null>(params.get('error') ? 'We couldn’t sign you in. Please try again.' : null)

  if (session) return <Navigate to={next} replace />

  const query = next === '/home' ? '' : `?next=${encodeURIComponent(next)}`

  return (
    <SignInView
      methods={METHODS}
      busy={busy}
      signUpTo={`/sign-up${query}`}
      notice={
        !authAvailable ? (
          <Banner tone="warning">Sign-in is not configured for this site.</Banner>
        ) : error ? (
          // A danger banner is announced at once (role="alert").
          <Banner tone="danger">{error}</Banner>
        ) : undefined
      }
      onProvider={async (provider) => {
        setBusy(provider)
        setError(null)
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        const result = await signInWithProvider(provider, { redirectTo })
        // On success the browser is leaving for the provider; only a failure comes back here.
        if (result.error) {
          setError(friendlyAuthError(result.code, 'provider'))
          setBusy(null)
        }
      }}
      onEmailSignIn={async ({ email, password }) => {
        setBusy('email')
        setError(null)
        const result = await signInWithEmail({ email, password })
        // Success: the auth listener sets the session and this page redirects to `next`.
        if (result.error) setError(friendlyAuthError(result.code, 'sign-in'))
        setBusy(null)
      }}
      footer={<LegalFooter />}
    />
  )
}
