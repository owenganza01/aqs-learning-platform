import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './auth-context'

/*
 * Authentication session provider (decision D15, clarified 23 October 2026; D42, 12 November 2026:
 * Google, Apple, Facebook and email with a password). State and actions only; the pages are in
 * live/pages. The Supabase SDK handles tokens and passwords; this file never reads, logs or stores
 * them.
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
        return { error: error ? error.message : null, code: error?.code ?? null }
      },
      signInWithProvider: async (provider, options) => {
        if (!supabase) return { error: NOT_CONFIGURED_MESSAGE }
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: options?.redirectTo ? { redirectTo: options.redirectTo } : undefined,
        })
        return { error: error ? error.message : null, code: error?.code ?? null }
      },
      signInWithEmail: async ({ email, password }) => {
        if (!supabase) return { error: NOT_CONFIGURED_MESSAGE }
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return { error: error ? error.message : null, code: error?.code ?? null }
      },
      signUpWithEmail: async ({ email, password, fullName, redirectTo }) => {
        if (!supabase) return { error: NOT_CONFIGURED_MESSAGE, confirmationSent: false }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
          },
        })
        if (error) return { error: error.message, code: error.code ?? null, confirmationSent: false }
        return { error: null, code: null, confirmationSent: data.session === null }
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
