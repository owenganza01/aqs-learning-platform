import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet'

type BadgeProps = {
  tone?: BadgeTone
  /** Small coloured dot before the text (used for statuses like "Active"). */
  dot?: boolean
  children: ReactNode
}

/**
 * Colour is never the only signal: the badge text always states the status.
 */
export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps) {
  return <span className={cx(styles.badge, styles[tone], dot && styles.dot)}>{children}</span>
}
