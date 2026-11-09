import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './auth-context'

/*
 * Authentication session provider for Google-only sign-in (decision D15, clarified 23 October 2026).
 * This phase provides state and actions only. It does not add sign-in UI, a callback page or
 * route protection. The Supabase SDK handles tokens; this file never reads, logs or stores them.
 */

const NOT_CONFIGURED_MESSAGE =
  'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const authAvailable = supabase !== null
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(authAvailable)

  useEffect(() => {
    if (!supabase) return

    // The listener emits INITIAL_SESSION on subscribe, which restores any stored session.
    // A separate getSession() call would repeat that work and could race with it.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      authAvailable,
      signInWithGoogle: async (options) => {
        if (!supabase) return { error: NOT_CONFIGURED_MESSAGE }
        // Without redirectTo, Auth uses the configured site URL. The live sign-in page passes
        // <site>/auth/callback, which must be on the project's redirect allow-list.
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options:
            options?.redirectTo || options?.selectAccount
              ? {
                  ...(options.redirectTo ? { redirectTo: options.redirectTo } : {}),
                  ...(options.selectAccount ? { queryParams: { prompt: 'select_account' } } : {}),
                }
              : undefined,
        })
        return { error: error ? error.message : null }
      },
      signOut: async () => {
        if (!supabase) return { error: NOT_CONFIGURED_MESSAGE }
        const { error } = await supabase.auth.signOut()
        return { error: error ? error.message : null }
      },
    }),
    [session, loading, authAvailable],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
