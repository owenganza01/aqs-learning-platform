import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../../lib/auth-context'
import { LoadingBlock } from '../components/States'
import { safeNext } from '../safe-next'

/*
 * Return point of Google sign-in. The Supabase client exchanges the one-time code in the URL
 * for a session by itself (PKCE); this page only waits for that and moves on. Errors from the
 * provider go back to the sign-in page without technical detail.
 */
export default function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  if (params.get('error') || params.get('error_description')) {
    return <Navigate to={`/sign-in?error=1&next=${encodeURIComponent(next)}`} replace />
  }
  if (session) return <Navigate to={next} replace />
  // The client has finished starting up (and tried the code) without a session.
  if (!loading) return <Navigate to={`/sign-in?error=1&next=${encodeURIComponent(next)}`} replace />
  return (
    <main id="main-content" style={{ maxWidth: 480, margin: '96px auto', padding: '0 16px' }}>
      <LoadingBlock label="Signing you in" rows={2} />
    </main>
  )
}
