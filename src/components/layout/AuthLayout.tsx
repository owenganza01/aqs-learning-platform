import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'
import styles from './AuthLayout.module.css'

type AuthLayoutProps = {
  /** Card content: heading, sign-in button, small print. */
  children: ReactNode
  /**
   * The photo on the navy side. The designs use a photo that has not been
   * exported as a separate asset yet, so a labelled placeholder shows instead.
   */
  illustration?: ReactNode
  mainId?: string
}

export function AuthLayout({ children, illustration, mainId = 'main-content' }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <main id={mainId} className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.brandMark}>
            <Wordmark />
          </div>
          {children}
        </div>
      </main>
      <aside className={styles.brandSide} aria-label="About AQS E-Learning">
        <p className={styles.eyebrow}>Learning that fits your life</p>
        <p className={styles.headline}>Learn at your pace, anywhere.</p>
        <div className={styles.illustration}>
          {illustration ?? (
            <div className={styles.placeholder}>Photo placeholder</div>
          )}
        </div>
      </aside>
    </div>
  )
}
