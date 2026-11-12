import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { OAuthProviderId } from './auth-methods'

/*
 * Shared types and hook for the authentication context (decision D15, clarified 23 October 2026).
 * The provider lives in auth.tsx so that Fast Refresh keeps working for components.
 */

export interface AuthActionResult {
  error: string | null
  /** Supabase Auth's error code (e.g. "invalid_credentials"), for a plain message (lib/auth-errors.ts). */
  code?: string | null
}

export interface EmailSignUpResult extends AuthActionResult {
  /**
   * True when the account still needs its email address confirmed (no session yet): the person
   * opens the link sent to them, which returns to /auth/callback. Also true for an address that
   * already has an account, so the page never reveals which addresses are registered.
   */
  confirmationSent: boolean
}

export interface AuthContextValue {
  /** The current session, or null when signed out or when authentication is unavailable. */
  session: Session | null
  /** True until the first auth-state event arrives. Always false when authentication is unavailable. */
  loading: boolean
  /** False when VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing. */
  authAvailable: boolean
  /**
   * `redirectTo` must be on the Auth redirect allow-list (live sign-in passes /auth/callback).
   * `selectAccount` asks Google to show its account chooser instead of reusing the account
   * already signed in to Google in this browser (needed when switching to an invited address).
   */
  signInWithGoogle: (options?: { redirectTo?: string; selectAccount?: boolean }) => Promise<AuthActionResult>
  /**
   * D42: Google, Apple or Facebook through Supabase Auth (OAuth with PKCE). The browser leaves for
   * the provider and comes back to `redirectTo` (/auth/callback). Each provider must be enabled
   * and configured in Supabase Auth first (docs/auth-providers.md).
   */
  signInWithProvider: (provider: OAuthProviderId, options?: { redirectTo?: string }) => Promise<AuthActionResult>
  /** D42: email and password sign-in. On success the session arrives through the auth listener. */
  signInWithEmail: (credentials: { email: string; password: string }) => Promise<AuthActionResult>
  /** D42: email and password sign-up; `fullName` fills the learner profile (migration 0002). */
  signUpWithEmail: (details: { email: string; password: string; fullName: string; redirectTo?: string }) => Promise<EmailSignUpResult>
  signOut: () => Promise<AuthActionResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }
  return context
}
