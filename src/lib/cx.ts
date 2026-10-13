/**
 * Joins CSS class names, skipping empty values.
 * Example: cx('button', isActive && 'active') -> "button active" or "button"
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
