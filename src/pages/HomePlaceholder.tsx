import { Wordmark } from '../components/layout'
import { ButtonLink, Card } from '../components/ui'
import styles from './StatusPage.module.css'

/**
 * Temporary home page. The real landing page (design P1) is built in Phase 2;
 * until then this keeps "/" honest about what exists.
 */
export function HomePlaceholder() {
  return (
    <main className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <Wordmark />
        <h1 className={styles.title}>The AQS Learning Platform is being built</h1>
        <p className="text-muted">
          Phase 1 contains the design foundations only. Public pages, sign-in and dashboards arrive in later
          phases.
        </p>
        {import.meta.env.DEV ? (
          <div className={styles.actions}>
            <ButtonLink to="/design-system" variant="secondary">
              Open the design system preview
            </ButtonLink>
          </div>
        ) : null}
      </Card>
    </main>
  )
}
