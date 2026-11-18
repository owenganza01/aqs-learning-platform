import { useSyncExternalStore } from 'react'

/*
 * Task 6-4: whether the browser says it is online. The browser's own online/offline events are the
 * only signal; nothing is retried or queued while offline (D7: no offline promises).
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}
