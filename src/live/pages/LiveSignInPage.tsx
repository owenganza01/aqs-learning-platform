import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Banner } from '../../components/ui'
import { useAuth } from '../../lib/auth-context'
import { SignInView } from '../../pages/SignInPage'
import { safeNext } from '../safe-next'
import { LegalFooter } from '../components/LegalFooter'

/** Live Google sign-in (D15). New people get a learner account on first sign-in (F1, P13). */
export default function LiveSignInPage() {
  const { session, signInWithGoogle, authAvailable } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error') ? 'We couldn’t sign you in. Please try again.' : null)

  if (session) return <Navigate to={next} replace />

  return (
    <SignInView
      photoCaption={false}
      busy={busy}
      notice={
        !authAvailable ? (
          <Banner tone="warning">Sign-in is not configured for this site.</Banner>
        ) : error ? (
          <Banner tone="danger">{error}</Banner>
        ) : undefined
      }
      onContinue={async () => {
        setBusy(true)
        setError(null)
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        const result = await signInWithGoogle({ redirectTo })
        if (result.error) {
          setError('We couldn’t open Google sign-in. Please try again.')
          setBusy(false)
        }
      }}
      footer={<LegalFooter />}
    />
  )
}
