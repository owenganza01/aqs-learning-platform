import { useState, type FormEvent } from 'react'
import { Button, TextField } from '../../components/ui'
import { OAUTH_PROVIDER_LABELS, isOAuthProvider, type AuthMethodId, type OAuthProviderId } from '../../lib/auth-methods'
import {
  PASSWORD_MIN_LENGTH,
  confirmPasswordError,
  emailError,
  existingPasswordError,
  fullNameError,
  newPasswordError,
} from '../../lib/auth-validation'
import styles from './AuthOptions.module.css'

/*
 * Sign-in and sign-up options shared by the sign-in and sign-up pages (D42, 12 November 2026):
 * "Continue with" buttons for the OAuth providers, then the email option, which opens its form.
 * The pages decide what each action does; in the development previews (D27) nothing is wired and
 * every control is inert.
 */

type ProviderButtonsProps = {
  methods: AuthMethodId[]
  /** Called with the provider chosen. Omitted in the inert development preview. */
  onProvider?: (provider: OAuthProviderId) => void
  /** The provider whose sign-in is opening (its button shows "Opening …"). */
  busyProvider?: OAuthProviderId | null
  /** Every control is disabled while any action is running. */
  disabled?: boolean
  describedBy?: string
}

export function ProviderButtons({ methods, onProvider, busyProvider = null, disabled = false, describedBy }: ProviderButtonsProps) {
  const providers = methods.filter(isOAuthProvider)
  return (
    <ul className={styles.providers} aria-label="Sign-in options">
      {providers.map((provider) => (
        <li key={provider}>
          <Button
            variant="neutral"
            fullWidth
            aria-describedby={describedBy}
            onClick={onProvider ? () => onProvider(provider) : undefined}
            disabled={disabled}
            loading={busyProvider === provider}
          >
            {busyProvider === provider ? `Opening ${OAUTH_PROVIDER_LABELS[provider]}…` : `Continue with ${OAUTH_PROVIDER_LABELS[provider]}`}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** "or" between the provider buttons and the email option. Decorative for assistive technology. */
export function OrDivider() {
  return (
    <p className={styles.divider} aria-hidden="true">
      <span>or</span>
    </p>
  )
}

type EmailToggleProps = {
  label: string
  open: boolean
  onToggle: () => void
  controls: string
  disabled?: boolean
}

/** The "Sign up with Email" / "Sign in with Email" option: shows or hides its form. */
export function EmailToggle({ label, open, onToggle, controls, disabled }: EmailToggleProps) {
  return (
    <Button variant="neutral" fullWidth aria-expanded={open} aria-controls={controls} onClick={onToggle} disabled={disabled}>
      {label}
    </Button>
  )
}

type FieldErrors = Partial<Record<'fullName' | 'email' | 'password' | 'confirm', string>>

type EmailFormProps = {
  id: string
  /** Inert development preview: fields and submit are disabled. */
  inert?: boolean
  busy?: boolean
  /** Moves focus to the first field when the form opens. */
  autoFocus?: boolean
}

export function EmailSignInForm({
  id,
  inert = false,
  busy = false,
  autoFocus = false,
  onSubmit,
}: EmailFormProps & { onSubmit?: (values: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (inert || busy) return
    const next: FieldErrors = { email: emailError(email) ?? undefined, password: existingPasswordError(password) ?? undefined }
    setErrors(next)
    if (next.email || next.password) return
    onSubmit?.({ email: email.trim(), password })
  }

  return (
    <form id={id} className={styles.form} onSubmit={submit} noValidate aria-label="Sign in with email">
      <fieldset className={styles.fieldset} disabled={inert}>
        <TextField
          autoFocus={autoFocus}
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        <Button type="submit" fullWidth loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
          {inert ? <span className="visually-hidden"> (not available yet)</span> : null}
        </Button>
      </fieldset>
    </form>
  )
}

export function EmailSignUpForm({
  id,
  inert = false,
  busy = false,
  autoFocus = false,
  onSubmit,
}: EmailFormProps & { onSubmit?: (values: { fullName: string; email: string; password: string }) => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (inert || busy) return
    const next: FieldErrors = {
      fullName: fullNameError(fullName) ?? undefined,
      email: emailError(email) ?? undefined,
      password: newPasswordError(password) ?? undefined,
      confirm: confirmPasswordError(password, confirm) ?? undefined,
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    onSubmit?.({ fullName: fullName.trim(), email: email.trim(), password })
  }

  return (
    <form id={id} className={styles.form} onSubmit={submit} noValidate aria-label="Sign up with email">
      <fieldset className={styles.fieldset} disabled={inert}>
        <TextField
          autoFocus={autoFocus}
          label="Full name"
          name="name"
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={errors.fullName}
        />
        <TextField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        <TextField
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" fullWidth loading={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
          {inert ? <span className="visually-hidden"> (not available yet)</span> : null}
        </Button>
      </fieldset>
    </form>
  )
}

