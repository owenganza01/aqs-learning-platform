import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../../lib/auth-context'
import { callbackProblem } from '../../lib/auth-errors'
import { LoadingBlock } from '../components/States'
import { safeNext } from '../safe-next'

/*
 * Return point of every sign-in (Google, Apple, Facebook, email confirmation links). The Supabase
 * client exchanges the one-time code in the URL for a session by itself (PKCE); this page only
 * waits for that and moves on. Errors go back to the sign-in page with their reason only
 * (cancelled, expired or failed; task 2-4), never with technical detail.
 */
export default function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const problem = callbackProblem(params)
  if (problem) return <Navigate to={`/sign-in?error=${problem}&next=${encodeURIComponent(next)}`} replace />
  if (session) return <Navigate to={next} replace />
  // The client has finished starting up (and tried the code) without a session.
  if (!loading) return <Navigate to={`/sign-in?error=failed&next=${encodeURIComponent(next)}`} replace />
  return (
    <main id="main-content" style={{ maxWidth: 480, margin: '96px auto', padding: '0 var(--space-16)' }}>
      <LoadingBlock label="Signing you in" rows={2} />
    </main>
  )
}
