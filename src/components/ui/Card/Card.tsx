import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Card.module.css'

type CardProps = HTMLAttributes<HTMLElement> & {
  /** Inner spacing. md = 24px (default), lg = 32px, none = 0 (e.g. tables). */
  padding?: 'md' | 'lg' | 'none'
  /** Adds the level-1 shadow. Most cards in the designs have it. */
  elevated?: boolean
  /** Render as a <section> (with a heading inside) or a plain <div>. */
  as?: 'div' | 'section' | 'article'
}

export function Card({ padding = 'md', elevated = true, as: Tag = 'div', className, ...rest }: CardProps) {
  const padClass = { md: styles.padMd, lg: styles.padLg, none: styles.padNone }[padding]
  return <Tag className={cx(styles.card, elevated && styles.elevated, padClass, className)} {...rest} />
}

type CardHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  /** Something on the right, e.g. a badge or a text button. */
  action?: ReactNode
  /** Heading level for correct document outline. Default h2. */
  headingLevel?: 'h2' | 'h3'
  /** Visual size: lg 24px (default), md 20px, sm 18px. Independent of headingLevel. */
  size?: 'lg' | 'md' | 'sm'
}

export function CardHeader({ title, subtitle, action, headingLevel: Heading = 'h2', size = 'lg' }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <Heading className={cx(styles.title, size === 'md' && styles.titleMd, size === 'sm' && styles.titleSm)}>
          {title}
        </Heading>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

type StatCardProps = {
  label: string
  value: ReactNode
  note?: ReactNode
}

/** Small summary card used across dashboards. */
export function StatCard({ label, value, note }: StatCardProps) {
  return (
    <Card elevated={false}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
      {note ? <p className={styles.statNote}>{note}</p> : null}
    </Card>
  )
}
