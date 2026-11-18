import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon, type IconName } from '../Icon/Icon'
import { buttonClasses, spinnerClass, type ButtonSize, type ButtonVariant } from './buttonClasses'
import { useConnection } from './connection'

type SharedProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  iconStart?: IconName
  iconEnd?: IconName
  children: ReactNode
}

type ButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Shows a spinner and blocks clicks while an action is in progress. */
    loading?: boolean
    /**
     * Task 6-4: the button sends something to the server, so it is disabled while offline. By
     * default this is every submit button and every button with a `loading` state (the action
     * buttons); set it explicitly to include or leave out a button.
     */
    needsConnection?: boolean
  }

/**
 * Use <Button> for actions on the current page (save, submit, open a dialog).
 * Use <ButtonLink> when the control takes the user to another page.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconStart,
  iconEnd,
  loading: loadingProp,
  needsConnection,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const online = useConnection()
  const loading = loadingProp ?? false
  const blockedOffline = !online && (needsConnection ?? (type === 'submit' || loadingProp !== undefined))
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, fullWidth, className)}
      disabled={disabled || loading || blockedOffline}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={spinnerClass} aria-hidden="true" /> : null}
      {!loading && iconStart ? <Icon name={iconStart} size={18} /> : null}
      {children}
      {blockedOffline ? <span className="visually-hidden"> (unavailable while offline)</span> : null}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  )
}

type ButtonLinkProps = SharedProps & Omit<LinkProps, 'children'>

/** A link that looks like a button (for navigation). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconStart,
  iconEnd,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, fullWidth, className)} {...rest}>
      {iconStart ? <Icon name={iconStart} size={18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </Link>
  )
}
