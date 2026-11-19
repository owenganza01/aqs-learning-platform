import { ButtonLink, Card } from '../components/ui'
import styles from './StatusPage.module.css'

export function NotFound() {
  return (
    <main className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <p className="eyebrow">Page not found</p>
        <h1 className={styles.title}>We couldn't find that page</h1>
        {/* A.10: plain wording that doesn't suggest an unfinished product, and two ways on. */}
        <p className="text-muted">The link may be mistyped, or the page may have moved.</p>
        <div className={styles.actions}>
          <ButtonLink to="/" variant="neutral">
            Home
          </ButtonLink>
          <ButtonLink to="/catalog" variant="neutral">
            Courses
          </ButtonLink>
        </div>
      </Card>
    </main>
  )
}
