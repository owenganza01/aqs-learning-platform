import { ButtonLink, Card } from '../components/ui'
import styles from './StatusPage.module.css'

export function NotFound() {
  return (
    <main className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <p className="eyebrow">Page not found</p>
        <h1 className={styles.title}>We couldn't find that page</h1>
        <p className="text-muted">It may not have been built yet, or the link may be wrong.</p>
        <div className={styles.actions}>
          <ButtonLink to="/" variant="neutral">
            Back to home
          </ButtonLink>
        </div>
      </Card>
    </main>
  )
}
