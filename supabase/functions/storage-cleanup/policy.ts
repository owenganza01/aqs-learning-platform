import { FunctionError } from '../_shared/core.ts'

/*
 * Pure rules for the storage-cleanup Edge Function (0017). Kept free of Deno and network code so
 * they run in the Node unit tests (tests/unit/storage-cleanup.test.mjs).
 *
 * Safety rules:
 *   - The function answers only a caller that presents CLEANUP_SECRET in the x-cleanup-secret
 *     header. Without that secret configured it refuses every request (it is inert by default).
 *     User sessions are never accepted.
 *   - Every run is a dry run unless BOTH the environment flag CLEANUP_DELETE_ENABLED is exactly
 *     "true" AND the request asks for { "mode": "delete" }. A delete request while the flag is off
 *     is refused, so a mistaken schedule is visible instead of silently doing nothing.
 *   - The grace period is at least 24 hours (default 7 days); the database applies the same floor.
 *   - At most CLEANUP_MAX_PER_RUN objects per run (default 100, never above 500).
 */

export const DEFAULT_MIN_AGE_HOURS = 168
export const MIN_AGE_FLOOR_HOURS = 24
export const DEFAULT_MAX_PER_RUN = 100
export const HARD_MAX_PER_RUN = 500
/** A run stops after this many failed deletions, so a Storage outage cannot churn through the list. */
export const MAX_FAILURES_PER_RUN = 3

export type CleanupEnv = { secret: string; deleteEnabled: string; maxPerRun: string }
export type CleanupPlan = { dryRun: boolean; minAgeHours: number; limit: number }

function positiveInt(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1) throw new FunctionError('invalid', `${label} must be a whole number of at least 1.`)
  return n
}

/** Constant-time comparison of the presented secret with the configured one. */
export async function secretMatches(presented: string | null | undefined, configured: string): Promise<boolean> {
  if (!configured || configured.length < 32) return false
  if (!presented) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(configured)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export function maxPerRun(configured: string): number {
  return Math.min(positiveInt(configured, DEFAULT_MAX_PER_RUN, 'CLEANUP_MAX_PER_RUN'), HARD_MAX_PER_RUN)
}

export function planRun(body: Record<string, unknown>, env: CleanupEnv): CleanupPlan {
  const mode = body.mode ?? 'dry-run'
  if (mode !== 'dry-run' && mode !== 'delete') throw new FunctionError('invalid', 'mode must be "dry-run" or "delete".')
  if (mode === 'delete' && env.deleteEnabled !== 'true') {
    throw new FunctionError('rule', 'Deletion is not enabled for this function. Run a dry run, or ask the owner to enable deletion.')
  }
  const cap = maxPerRun(env.maxPerRun)
  const limit = Math.min(positiveInt(body.maxObjects, cap, 'maxObjects'), cap)
  const minAgeHours = Math.max(positiveInt(body.minAgeHours, DEFAULT_MIN_AGE_HOURS, 'minAgeHours'), MIN_AGE_FLOOR_HOURS)
  return { dryRun: mode !== 'delete', minAgeHours, limit }
}
