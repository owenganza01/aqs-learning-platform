import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon, type IconName } from '../Icon/Icon'
import { buttonClasses, spinnerClass, type ButtonSize, type ButtonVariant } from './buttonClasses'

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
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, fullWidth, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={spinnerClass} aria-hidden="true" /> : null}
      {!loading && iconStart ? <Icon name={iconStart} size={18} /> : null}
      {children}
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
