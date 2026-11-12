import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'
import type { AuthPhoto } from './auth-photos'
import styles from './AuthLayout.module.css'

/** The photo on the navy side. Shown at 480 × 320 at most; the file is 960 × 640 for sharp screens. */
export function AuthPhotoImage({ photo }: { photo: AuthPhoto }) {
  return <img className={styles.photo} src={photo.src} alt={photo.alt} width={960} height={640} decoding="async" />
}

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
