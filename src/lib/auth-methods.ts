/*
 * Sign-in and sign-up methods (D42, 12 November 2026): Google, Apple, Facebook and email with a
 * password, all through Supabase Auth. Google stays the only identity that grants staff access:
 * invitations and domain admission accept a verified Google identity only (D33, migrations 0006
 * and 0015), so the other methods create ordinary learner accounts.
 *
 * A method is offered only when it is switched on for the deployment in VITE_AUTH_PROVIDERS
 * (comma-separated, e.g. "google,apple,facebook,email"), because a button whose provider is not
 * configured in Supabase Auth cannot complete its flow. Google is always offered. The setup each
 * provider needs is in docs/auth-providers.md.
 */

export type OAuthProviderId = 'google' | 'apple' | 'facebook'
export type AuthMethodId = OAuthProviderId | 'email'

/** Display order on the sign-in and sign-up pages. */
export const AUTH_METHOD_ORDER: readonly AuthMethodId[] = ['google', 'apple', 'facebook', 'email']

export const OAUTH_PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
}

/** The methods switched on in `raw` (VITE_AUTH_PROVIDERS), in display order. Google is always on. */
export function parseAuthMethods(raw: string | undefined | null): AuthMethodId[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  )
  wanted.add('google')
  return AUTH_METHOD_ORDER.filter((method) => wanted.has(method))
}

export function isOAuthProvider(method: AuthMethodId): method is OAuthProviderId {
  return method !== 'email'
}
