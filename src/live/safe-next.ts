/** Accept only a same-site path for post-sign-in redirects (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = '/home'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
