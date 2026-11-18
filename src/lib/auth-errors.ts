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

/*
 * Task 2-4: why a sign-in came back without a session, read from the provider's return URL on
 * /auth/callback, and the message the sign-in page shows for it. Nothing technical is shown, and
 * nothing says whether an account exists.
 */
export type SignInProblem = 'cancelled' | 'expired' | 'failed'

/** The reason behind a return to /auth/callback with an error (Supabase Auth / OAuth error fields). */
export function callbackProblem(params: { get(name: string): string | null }): SignInProblem | null {
  const error = params.get('error')
  const code = params.get('error_code')
  if (!error && !code && !params.get('error_description')) return null
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') return 'expired'
  // The person closed or declined the provider's consent screen.
  if (error === 'access_denied' && !code) return 'cancelled'
  if (error === 'access_denied' && (code === 'access_denied' || code === 'user_cancelled')) return 'cancelled'
  return 'failed'
}

/** The sign-in page's `?error=` value back to a reason; older links used `error=1`. */
export function signInProblemFromQuery(value: string | null): SignInProblem | null {
  if (!value) return null
  return value === 'cancelled' || value === 'expired' ? value : 'failed'
}

export const SIGN_IN_PROBLEM_MESSAGES: Record<SignInProblem, { tone: 'info' | 'danger'; text: string }> = {
  cancelled: { tone: 'info', text: 'Sign-in was cancelled. Choose an option below when you are ready.' },
  expired: {
    tone: 'danger',
    text: 'That sign-in link has expired or was already used. Sign in again to get a new one.',
  },
  failed: { tone: 'danger', text: 'We couldn’t sign you in. Please try again.' },
}

/** Shown when this site has no sign-in set up (no Supabase settings). */
export const SIGN_IN_NOT_CONFIGURED = 'Sign-in is not available on this site right now. Please try again later.'
