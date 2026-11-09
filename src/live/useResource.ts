import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toAppError, type AppError } from './api'

export type Resource<T> =
  | { state: 'loading'; data: undefined; error: undefined; reload: () => void }
  | { state: 'ready'; data: T; error: undefined; reload: () => void }
  | { state: 'error'; data: undefined; error: AppError; reload: () => void }

/**
 * Load data for a page. `key` identifies the request: when it changes, the data is loaded
 * again and any answer to an older request is ignored. `reload()` loads the same key again,
 * keeping the current data on screen until the new answer arrives.
 */
export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [snapshot, setSnapshot] = useState<{ key: string; data?: T; error?: AppError } | null>(null)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  useLayoutEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let current = true
    loadRef.current().then(
      (data) => current && setSnapshot({ key, data }),
      (error) => current && setSnapshot({ key, error: toAppError(error) }),
    )
    return () => {
      current = false
    }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  if (!snapshot || snapshot.key !== key) return { state: 'loading', data: undefined, error: undefined, reload }
  if (snapshot.error) return { state: 'error', data: undefined, error: snapshot.error, reload }
  return { state: 'ready', data: snapshot.data as T, error: undefined, reload }
}

/** Run an action (a write) with busy and error state for a button or form. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false; value?: undefined }> => {
      setBusy(true)
      setError(null)
      try {
        return { ok: true, value: await action(...args) }
      } catch (caught) {
        setError(toAppError(caught))
        return { ok: false }
      } finally {
        setBusy(false)
      }
    },
    [action],
  )
  return { run, busy, error, clearError: () => setError(null) }
}
