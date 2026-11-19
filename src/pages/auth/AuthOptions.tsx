import { useId, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
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
import { AppleMark } from './AppleMark'
import { FacebookMark } from './FacebookMark'
import { GoogleMark } from './GoogleMark'
import styles from './AuthOptions.module.css'

/*
 * Sign-in and sign-up options shared by the sign-in and sign-up pages (D42, 12 November 2026):
 * the email form first (commit 275f12a), then the OAuth providers' "Continue with" buttons in one group
 * under "Or continue with" (Revision 2 Phase 7, A.1: one email entry point, no second email control).
 * Presentation only (amendment 4): which methods appear still comes from the page (VITE_AUTH_PROVIDERS).
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
            {/* Task 2-2: each provider's own logo on its button (the spinner takes its place while opening). */}
            {busyProvider !== provider ? <ProviderMark provider={provider} /> : null}
            {busyProvider === provider ? `Opening ${OAUTH_PROVIDER_LABELS[provider]}…` : `Continue with ${OAUTH_PROVIDER_LABELS[provider]}`}
          </Button>
        </li>
      ))}
    </ul>
  )
}

const PROVIDER_MARKS: Record<OAuthProviderId, ComponentType> = {
  google: GoogleMark,
  apple: AppleMark,
  facebook: FacebookMark,
}

function ProviderMark({ provider }: { provider: OAuthProviderId }) {
  const Mark = PROVIDER_MARKS[provider]
  return <Mark />
}

/**
 * The provider buttons under a visible "Or continue with" label, as one named group. Used when the email
 * form is offered above them; with Google alone the page shows the buttons without the label.
 */
export function ProviderGroup({ children }: { children: ReactNode }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className={styles.group}>
      <p className={styles.divider} id={labelId}>
        <span>Or continue with</span>
      </p>
      {children}
    </div>
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

