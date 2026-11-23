import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth-context'
import { callbackProblem } from '../../lib/auth-errors'
import { LoadingBlock } from '../components/States'
import { safeNext } from '../safe-next'

/*
 * Return point of every sign-in (Google, Apple, Facebook, email confirmation links). The Supabase
 * client exchanges the one-time code in the URL for a session by itself (PKCE); this page explicitly
 * completes the code exchange and moves on. Errors go back to the sign-in page with their reason only
 * (cancelled, expired or failed; task 2-4), never with technical detail.
 */
export default function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const code = params.get('code')
  const problem = callbackProblem(params)

  const [exchanging, setExchanging] = useState(Boolean(code && !session))
  const [exchangeFailed, setExchangeFailed] = useState(false)

  useEffect(() => {
    if (!code || session) return

    let cancelled = false
    setExchanging(true)

    if (supabase) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          if (cancelled) return
          if (error || !data.session) {
            setExchangeFailed(true)
          }
          setExchanging(false)
        })
        .catch(() => {
          if (!cancelled) {
            setExchangeFailed(true)
            setExchanging(false)
          }
        })
    } else {
      setExchangeFailed(true)
      setExchanging(false)
    }

    return () => {
      cancelled = true
    }
  }, [code, session])

  if (problem) return <Navigate to={`/sign-in?error=${problem}&next=${encodeURIComponent(next)}`} replace />
  if (exchangeFailed) return <Navigate to={`/sign-in?error=failed&next=${encodeURIComponent(next)}`} replace />
  if (session) return <Navigate to={next} replace />

  if (exchanging || loading || code) {
    return (
      <main id="main-content" style={{ maxWidth: 480, margin: '96px auto', padding: '0 var(--space-16)' }}>
        <LoadingBlock label="Signing you in" rows={2} />
      </main>
    )
  }

  return <Navigate to={`/sign-in?error=failed&next=${encodeURIComponent(next)}`} replace />
}
