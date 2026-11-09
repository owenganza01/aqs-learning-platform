import { cx } from '../../../lib/cx'
import styles from './Avatar.module.css'

type AvatarProps = {
  /** Full name. Used for the initials and for screen readers. */
  name: string
  size?: 'sm' | 'md' | 'lg'
  /**
   * Set to true when the name is already shown as text next to the avatar,
   * so screen readers don't hear it twice.
   */
  decorative?: boolean
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, size = 'md', decorative = false }: AvatarProps) {
  return (
    <span
      className={cx(styles.avatar, styles[size])}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      {initialsFrom(name)}
    </span>
  )
}
