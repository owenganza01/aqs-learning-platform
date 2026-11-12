/*
 * Client-side checks for the email sign-in and sign-up forms (D42). They help people fix mistakes
 * before sending; Supabase Auth checks again, and its rules decide. Passwords are never stored or
 * logged by the app: Supabase Auth hashes them.
 */

/** Minimum length asked of new passwords (Supabase Auth's own minimum is lower and still applies). */
export const PASSWORD_MIN_LENGTH = 8
/** bcrypt, used by Supabase Auth, reads at most 72 bytes; longer passwords are refused up front. */
export const PASSWORD_MAX_LENGTH = 72

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Enter your email address.'
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com.'
  return null
}

export function newPasswordError(value: string): string | null {
  if (!value) return 'Enter a password.'
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`
  return null
}

export function confirmPasswordError(password: string, confirmation: string): string | null {
  if (!confirmation) return 'Enter the password again.'
  return confirmation === password ? null : 'The passwords do not match.'
}

export function fullNameError(value: string): string | null {
  const name = value.trim()
  if (!name) return 'Enter your full name.'
  if (name.length > 120) return 'Use at most 120 characters.'
  return null
}

/** For signing in: only presence is checked, so no rule about existing passwords is revealed. */
export function existingPasswordError(value: string): string | null {
  return value ? null : 'Enter your password.'
}
