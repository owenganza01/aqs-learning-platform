import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './EmptyState.module.css'

type EmptyStateProps = {
  /** Optional. No decorative icon is shown unless one is passed. */
  icon?: IconName
  title: string
  description?: ReactNode
  /** Usually one primary button, e.g. "Browse courses". */
  action?: ReactNode
  headingLevel?: 'h2' | 'h3'
}

export function EmptyState({ icon, title, description, action, headingLevel: Heading = 'h3' }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={24} />
        </span>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
