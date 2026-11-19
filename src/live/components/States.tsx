import type { ReactNode } from 'react'
import { Banner, Button, Skeleton } from '../../components/ui'
import type { AppError } from '../api'
import type { Resource } from '../useResource'
import styles from './States.module.css'

/*
 * Task 6-1: loading placeholders shaped like the content that replaces them, so pages do not jump
 * and people can tell what is coming. Each shape is announced once to screen readers (role status,
 * a hidden label); the shapes themselves are hidden from assistive technology.
 */
export type LoadingShape = 'rows' | 'stats' | 'table' | 'cards' | 'dashboard' | 'editor' | 'detail' | 'form'

export function LoadingBlock({ label, rows = 3, shape = 'rows' }: { label: string; rows?: number; shape?: LoadingShape }) {
  return (
    <div aria-busy="true" role="status" className={styles.loading} data-shape={shape}>
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true" className={styles.shapes}>
        <LoadingShapes shape={shape} rows={rows} />
      </div>
    </div>
  )
}

function StatCards() {
  return (
    <div className={styles.stats}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.panel}>
          <Skeleton shape="text" width="45%" />
          <Skeleton height={32} width="35%" />
          <Skeleton shape="text" width="60%" />
        </div>
      ))}
    </div>
  )
}

function TableRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.panel}>
      <Skeleton shape="text" width="30%" />
      <div className={styles.tableHead}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} shape="text" width="60%" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.tableRow}>
          <Skeleton shape="text" width="80%" />
          <Skeleton shape="text" width="55%" />
          <Skeleton shape="text" width="40%" />
          <Skeleton shape="text" width="30%" />
        </div>
      ))}
    </div>
  )
}

function CardGrid() {
  return (
    <div className={styles.cards}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.panel}>
          <Skeleton height={120} />
          <Skeleton shape="text" width="75%" height={18} />
          <Skeleton shape="text" width="50%" />
          <Skeleton height={36} width={120} />
        </div>
      ))}
    </div>
  )
}

function LoadingShapes({ shape, rows }: { shape: LoadingShape; rows: number }) {
  switch (shape) {
    case 'stats':
      return <StatCards />
    case 'table':
      return <TableRows rows={Math.max(rows, 4)} />
    case 'cards':
      return <CardGrid />
    case 'dashboard':
      return (
        <>
          <StatCards />
          <TableRows rows={4} />
        </>
      )
    case 'editor':
      return (
        <div className={styles.editor}>
          <div className={styles.panel}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} shape="text" width={i % 3 === 0 ? '70%' : '55%'} height={i % 3 === 0 ? 16 : 12} />
            ))}
          </div>
          <div className={styles.panel}>
            <Skeleton shape="text" width="40%" height={20} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={120} />
            <Skeleton height={40} width={140} />
          </div>
        </div>
      )
    case 'detail':
      return (
        <div className={styles.column}>
          <Skeleton shape="text" width="45%" height={28} />
          <Skeleton shape="text" width="70%" />
          <div className={styles.panel}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} shape="text" width={`${85 - i * 10}%`} />
            ))}
          </div>
          <TableRows rows={3} />
        </div>
      )
    case 'form':
      return (
        <div className={styles.panel}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={styles.field}>
              <Skeleton shape="text" width="25%" />
              <Skeleton height={40} />
            </div>
          ))}
          <Skeleton height={40} width={140} />
        </div>
      )
    default:
      return (
        <>
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} height={index === 0 ? 32 : 56} />
          ))}
        </>
      )
  }
}

export function ErrorBanner({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <Banner
      tone="danger"
      action={
        onRetry && error.kind !== 'forbidden' ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {error.message}
    </Banner>
  )
}

/** Renders a resource: a loading block, an error with retry, or the content. */
export function Loaded<T>({
  resource,
  label,
  loading = 'rows',
  children,
}: {
  resource: Resource<T>
  label: string
  /** The shape of the placeholder while loading (task 6-1): match the content below. */
  loading?: LoadingShape
  children: (data: T) => ReactNode
}) {
  if (resource.state === 'loading') return <LoadingBlock label={label} shape={loading} />
  if (resource.state === 'error') return <ErrorBanner error={resource.error} onRetry={resource.reload} />
  return <>{children(resource.data)}</>
}

/*
 * Task 6-3: the one way an action reports back. Place it directly below the buttons of the form
 * or panel it belongs to. An error is announced at once (role alert). A confirmation appears in a
 * polite live region that is always on the page, so screen readers announce it reliably (a region
 * inserted together with its message is often missed).
 */
export function ActionFeedback({ error, success }: { error: AppError | null; success?: string | null }) {
  return (
    <div className={styles.feedback} data-empty={!error && !success ? 'true' : undefined}>
      {error ? <Banner tone="danger">{error.message}</Banner> : null}
      <div role="status" aria-atomic="true">
        {!error && success ? (
          <Banner tone="success" live={false}>
            {success}
          </Banner>
        ) : null}
      </div>
    </div>
  )
}
