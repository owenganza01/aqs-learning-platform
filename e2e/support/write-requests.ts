import type { Page } from '@playwright/test'

/**
 * Every request the page makes that is not a same-origin GET, collected from now on. Only GET requests
 * are treated as reads: development modules are loaded with GET when a lazy route first opens, so a
 * GET is never counted as a write. Call this after the page has loaded, so the origin is known.
 */
export function trackWrites(page: Page) {
  const writes: string[] = []
  const origin = new URL(page.url() || 'http://localhost').origin
  page.on('request', (request) => {
    const sameOriginGet = request.method() === 'GET' && new URL(request.url()).origin === origin
    if (!sameOriginGet) writes.push(`${request.method()} ${request.url()}`)
  })
  return writes
}
