/*
 * Supabase Auth error codes turned into plain messages (D42). The messages never say whether an
 * email address has an account, and never show technical detail.
 */

export type AuthFlow = 'sign-in' | 'sign-up' | 'provider'

export function friendlyAuthError(code: string | null | undefined, flow: AuthFlow): string {
  switch (code) {
    case 'invalid_credentials':
      return 'The email address or password is not right. Check them and try again.'
    case 'email_not_confirmed':
      return 'Confirm your email address first: open the link we sent you, then sign in.'
    case 'weak_password':
      return 'Choose a stronger password: longer, and not a common one.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'signup_disabled':
    case 'email_provider_disabled':
    case 'provider_disabled':
      return flow === 'sign-up'
        ? 'Creating an account this way is not available right now. Try another option.'
        : 'Signing in this way is not available right now. Try another option.'
    default:
      if (flow === 'provider') return 'We couldn’t open that sign-in option. Please try again.'
      // Also covers user_already_exists, in words that do not confirm that the address has an account.
      return flow === 'sign-up'
        ? 'We couldn’t create your account. If you already have one, sign in instead.'
        : 'We couldn’t sign you in. Please try again.'
  }
}
