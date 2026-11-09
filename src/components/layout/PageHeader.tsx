import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  /** Usually text. A status badge may sit beside it. */
  title: ReactNode
  /** A short sentence under the title. */
  description?: string
  /** Optional controls, such as a primary action, aligned to the end of the header. */
  actions?: ReactNode
}

/** Consistent title block for workspace pages: one h1, optional description and actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={cx('text-h2', styles.title)}>{title}</h1>
        {description ? <p className={cx('text-body', styles.description)}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
