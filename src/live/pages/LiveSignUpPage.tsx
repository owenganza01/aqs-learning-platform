import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Banner } from '../../components/ui'
import { useAuth } from '../../lib/auth-context'
import { friendlyAuthError } from '../../lib/auth-errors'
import { parseAuthMethods, type AuthMethodId } from '../../lib/auth-methods'
import { SignUpView } from '../../pages/SignUpPage'
import { safeNext } from '../safe-next'
import { LegalFooter } from '../components/LegalFooter'

const METHODS = parseAuthMethods(import.meta.env.VITE_AUTH_PROVIDERS)

/*
 * Live sign-up (D42, 12 November 2026). Google, Apple and Facebook create the learner account on
 * the first sign-in, exactly as on the sign-in page. "Sign up with Email" creates an email and
 * password account through Supabase Auth; when the project asks for email confirmation, the person
 * confirms through the link sent to them, which returns to /auth/callback and then to `next`.
 * Every new account is a learner with no organization and no privileged role (F1).
 */
export default function LiveSignUpPage() {
  const { session, signInWithProvider, signUpWithEmail, authAvailable } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState<AuthMethodId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  if (session) return <Navigate to={next} replace />

  const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  const query = next === '/home' ? '' : `?next=${encodeURIComponent(next)}`

  return (
    <SignUpView
      methods={METHODS}
      busy={busy}
      confirmationSentTo={confirmationSentTo}
      signInTo={`/sign-in${query}`}
      notice={
        !authAvailable ? (
          <Banner tone="warning">Sign-up is not configured for this site.</Banner>
        ) : error ? (
          // A danger banner is announced at once (role="alert").
          <Banner tone="danger">{error}</Banner>
        ) : undefined
      }
      onProvider={async (provider) => {
        setBusy(provider)
        setError(null)
        const result = await signInWithProvider(provider, { redirectTo: callback })
        if (result.error) {
          setError(friendlyAuthError(result.code, 'provider'))
          setBusy(null)
        }
      }}
      onEmailSignUp={async ({ fullName, email, password }) => {
        setBusy('email')
        setError(null)
        const result = await signUpWithEmail({ fullName, email, password, redirectTo: callback })
        if (result.error) setError(friendlyAuthError(result.code, 'sign-up'))
        else if (result.confirmationSent) setConfirmationSentTo(email)
        // Otherwise a session started (confirmation switched off) and this page redirects to `next`.
        setBusy(null)
      }}
      footer={<LegalFooter />}
    />
  )
}
