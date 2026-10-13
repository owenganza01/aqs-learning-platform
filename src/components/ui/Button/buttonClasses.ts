import { cx } from '../../../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'text' | 'danger'
export type ButtonSize = 'md' | 'sm'

/** Builds the class list shared by <Button> and <ButtonLink>. */
export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
): string {
  return cx(
    styles.button,
    styles[variant],
    size === 'sm' && styles.sm,
    fullWidth && styles.fullWidth,
    className,
  )
}

export const spinnerClass = styles.spinner
