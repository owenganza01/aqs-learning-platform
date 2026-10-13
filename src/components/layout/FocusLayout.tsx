import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Avatar, Icon, ProgressBar } from '../ui'
import type { CurrentUser } from './types'
import styles from './FocusLayout.module.css'

type FocusLayoutProps = {
  back: { label: string; to: string }
  /** Small blue label above the title, e.g. the course category. */
  eyebrow?: string
  title: string
  /** Overall progress shown on the right ("Your progress 42%"). */
  progress?: { label: string; value: number }
  user: CurrentUser
  /** Sticky action bar at the bottom (e.g. "Mark as done", "Next lesson"). */
  footer?: ReactNode
  children: ReactNode
  mainId?: string
}

export function FocusLayout({
  back,
  eyebrow,
  title,
  progress,
  user,
  footer,
  children,
  mainId = 'main-content',
}: FocusLayoutProps) {
  return (
    <div className={styles.page}>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link to={back.to} className={styles.back}>
          <Icon name="arrowLeft" size={20} label={`Back to ${back.label}`} />
          <span className={styles.backLabel} aria-hidden="true">
            {back.label}
          </span>
        </Link>
        <div className={styles.titleBlock}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.end}>
          {progress ? (
            <div className={styles.progress}>
              <ProgressBar label={progress.label} value={progress.value} />
            </div>
          ) : null}
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.avatar}>
            <Avatar name={user.name} />
          </span>
        </div>
      </header>

      <main id={mainId} className={styles.main} tabIndex={-1}>
        {children}
      </main>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  )
}
