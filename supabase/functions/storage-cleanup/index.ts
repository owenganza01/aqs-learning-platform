import { fromDbError, FunctionError } from '../_shared/core.ts'
import { adminClient, serve } from '../_shared/http.ts'
import { MAX_FAILURES_PER_RUN, planRun, secretMatches } from './policy.ts'

/*
 * storage-cleanup (0017, Q-07-15): removes Storage objects that no course record references any
 * more (replaced or deleted files, videos and thumbnails), after a grace period.
 *
 * STATUS (3 November 2026): PREPARED ONLY. Not deployed, not scheduled, no secret set. Deploying,
 * setting CLEANUP_SECRET, enabling deletion (CLEANUP_DELETE_ENABLED=true) and scheduling it each
 * need the owner's explicit authorization, and migration 0017 must be applied first.
 *
 * Called server to server only (a scheduler), never from the app:
 *   POST  header x-cleanup-secret: <CLEANUP_SECRET>
 *         { mode?: 'dry-run' | 'delete', maxObjects?: number, minAgeHours?: number }
 *   -> { runId, dryRun, listed, approved, deleted, failed, skipped, objects? }
 * Dry runs (the default) list what WOULD be deleted, record it in the audit and delete nothing.
 *
 * Every object is re-checked by public.storage_cleanup_check immediately before it is deleted,
 * and each decision and outcome is written to private.storage_cleanup_audit (append-only).
 * The database functions accept only the service (secret) key; the key never leaves this function.
 */

serve(async (req, body) => {
  const secret = Deno.env.get('CLEANUP_SECRET') ?? ''
  if (!secret) throw new FunctionError('unavailable', 'This service is not configured.')
  if (!(await secretMatches(req.headers.get('x-cleanup-secret'), secret))) {
    throw new FunctionError('forbidden', 'Not permitted.', 401)
  }
  const plan = planRun(body, {
    secret,
    deleteEnabled: Deno.env.get('CLEANUP_DELETE_ENABLED') ?? '',
    maxPerRun: Deno.env.get('CLEANUP_MAX_PER_RUN') ?? '',
  })

  const db = adminClient()
  const runId = crypto.randomUUID()
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data
  }

  await rpc('storage_cleanup_run_event', {
    p_run: runId,
    p_event: 'run_started',
    p_dry_run: plan.dryRun,
    p_detail: { min_age_hours: plan.minAgeHours, limit: plan.limit },
  })

  const counts = { listed: 0, approved: 0, deleted: 0, failed: 0, skipped: 0 }
  const objects: { bucket: string; name: string }[] = []
  let stoppedEarly = false
  try {
    const candidates = (await rpc('storage_cleanup_candidates', { p_min_age_hours: plan.minAgeHours, p_limit: plan.limit })) as {
      bucket_id: string
      object_name: string
    }[]
    counts.listed = candidates.length

    for (const c of candidates) {
      const approved = (await rpc('storage_cleanup_check', {
        p_run: runId,
        p_bucket: c.bucket_id,
        p_name: c.object_name,
        p_min_age_hours: plan.minAgeHours,
        p_dry_run: plan.dryRun,
      })) as boolean
      if (plan.dryRun) {
        objects.push({ bucket: c.bucket_id, name: c.object_name })
        continue
      }
      if (!approved) {
        counts.skipped++
        continue
      }
      counts.approved++
      const { error } = await db.storage.from(c.bucket_id).remove([c.object_name])
      await rpc('storage_cleanup_result', {
        p_run: runId,
        p_bucket: c.bucket_id,
        p_name: c.object_name,
        p_deleted: !error,
        p_error: error ? error.message : null,
      })
      if (error) {
        counts.failed++
        if (counts.failed >= MAX_FAILURES_PER_RUN) {
          stoppedEarly = true
          break
        }
      } else {
        counts.deleted++
      }
    }
  } finally {
    await rpc('storage_cleanup_run_event', {
      p_run: runId,
      p_event: 'run_finished',
      p_dry_run: plan.dryRun,
      p_detail: { ...counts, stopped_early: stoppedEarly },
    })
  }

  return { runId, dryRun: plan.dryRun, ...counts, stoppedEarly, ...(plan.dryRun ? { objects } : {}) }
})
