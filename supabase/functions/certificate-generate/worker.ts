import { FunctionError } from '../_shared/core.ts'
import type { CertificateData, TemplateInput, TemplateKind } from './render.ts'

/*
 * certificate-generate batch logic (0026, A11), free of Deno and Supabase imports so the Node unit
 * tests (worker.test.mjs) run it with fakes. index.ts supplies the real database, Storage and renderer.
 *
 * One run: claim up to `limit` certificates (public.claim_certificates leases each for 10 minutes and
 * counts the attempt), then for each: download its template snapshot, render, upload the PDF to the
 * private certificates bucket, and record success (the database then queues the certificate_issued
 * email, dedupe key = certificate id). Any failure is recorded with a short reason and retried later
 * with back-off by the database; one certificate's failure never stops the others.
 */

export const DEFAULT_BATCH = 10
export const MAX_BATCH = 25

export type Claimed = {
  certificate_id: string
  code: string
  template_kind: TemplateKind
  template_path: string
  page_width: number | string
  page_height: number | string
  placements: unknown
  date_locale: string
  participant_name: string
  course_title: string
  organization_name: string
  completed_at: string
  output_path: string
  attempts: number
}

export type WorkerDeps = {
  claim: (limit: number) => Promise<Claimed[]>
  download: (path: string) => Promise<Uint8Array>
  render: (template: TemplateInput, data: CertificateData) => Promise<Uint8Array>
  upload: (path: string, pdf: Uint8Array) => Promise<void>
  record: (id: string, ok: boolean, error: string | null) => Promise<string>
}

/** Constant-time comparison of the presented secret with the configured one (at least 32 characters). */
export async function secretMatches(presented: string | null | undefined, configured: string): Promise<boolean> {
  if (!configured || configured.length < 32 || !presented) return false
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

export function batchSize(body: Record<string, unknown>): number {
  const value = body.limit
  if (value === undefined || value === null) return DEFAULT_BATCH
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new FunctionError('invalid', 'limit must be a whole number of at least 1.')
  return Math.min(value, MAX_BATCH)
}

/** A short, non-personal reason for the database (at most 300 characters). */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error'
  return message.replace(/\s+/g, ' ').trim().slice(0, 300) || 'unknown error'
}

export async function runBatch(limit: number, deps: WorkerDeps) {
  const claimed = await deps.claim(limit)
  const counts = { claimed: claimed.length, generated: 0, failed: 0 }
  for (const c of claimed) {
    try {
      let bytes: Uint8Array
      try {
        bytes = await deps.download(c.template_path)
      } catch (error) {
        throw new Error(`template download failed: ${failureReason(error)}`, { cause: error })
      }
      const pdf = await deps.render(
        {
          kind: c.template_kind,
          bytes,
          pageWidth: Number(c.page_width),
          pageHeight: Number(c.page_height),
          placements: c.placements,
          dateLocale: c.date_locale,
        },
        {
          participantName: c.participant_name,
          courseTitle: c.course_title,
          organizationName: c.organization_name,
          completedAt: c.completed_at,
          certificateCode: c.code,
        },
      )
      try {
        await deps.upload(c.output_path, pdf)
      } catch (error) {
        throw new Error(`upload failed: ${failureReason(error)}`, { cause: error })
      }
      await deps.record(c.certificate_id, true, null)
      counts.generated++
    } catch (error) {
      counts.failed++
      try {
        await deps.record(c.certificate_id, false, failureReason(error))
      } catch {
        // The lease expires after 10 minutes and the certificate is claimed again.
      }
    }
  }
  return counts
}
