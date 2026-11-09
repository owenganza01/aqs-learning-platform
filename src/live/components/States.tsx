import type { ReactNode } from 'react'
import { Banner, Button, Skeleton } from '../../components/ui'
import type { AppError } from '../api'
import type { Resource } from '../useResource'

/** Loading placeholder for a page section, announced once to screen readers. */
export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" role="status" style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={index === 0 ? 32 : 56} />
      ))}
    </div>
  )
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
  children,
}: {
  resource: Resource<T>
  label: string
  children: (data: T) => ReactNode
}) {
  if (resource.state === 'loading') return <LoadingBlock label={label} />
  if (resource.state === 'error') return <ErrorBanner error={resource.error} onRetry={resource.reload} />
  return <>{children(resource.data)}</>
}

/** Inline result of an action: an error, or a short confirmation. */
export function ActionFeedback({ error, success }: { error: AppError | null; success?: string | null }) {
  if (error) return <Banner tone="danger">{error.message}</Banner>
  if (success) return <Banner tone="success">{success}</Banner>
  return null
}
