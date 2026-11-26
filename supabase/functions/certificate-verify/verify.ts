import { fromDbError, FunctionError } from '../_shared/core.ts'

/*
 * certificate-verify logic (0026, A11), free of Deno and Supabase imports (verify.test.mjs).
 * Public: anyone holding a certificate ID can check it. The answer is deliberately minimal (decided in
 * 0026): valid, participant name, course title, organisation name and completion date. Nothing else
 * (no email, no account, no other certificates). Unknown or not-yet-issued codes answer
 * { valid: false } only. Codes carry 80 random bits, so they cannot be guessed or enumerated.
 */

export function normalizeCode(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) throw new FunctionError('invalid', 'Enter the certificate ID.')
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(raw)) throw new FunctionError('invalid', 'Enter the certificate ID as it is printed, for example K7QM-3XPA-9RTD-W2HF.')
  return raw.match(/.{4}/g)!.join('-')
}

export type VerifyRow = { valid: boolean; participant_name: string | null; course_title: string | null; organization_name: string | null; completed_on: string | null }
export type VerifyResult =
  | { valid: true; participantName: string; courseTitle: string; organizationName: string; completedOn: string }
  | { valid: false }

export async function verify(
  body: Record<string, unknown>,
  rpc: (code: string) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<VerifyResult> {
  const code = normalizeCode(body.code)
  const { data, error } = await rpc(code)
  if (error) throw fromDbError(error)
  const row = (data as VerifyRow[] | null)?.[0]
  if (!row || !row.valid || !row.participant_name || !row.course_title || !row.organization_name || !row.completed_on) return { valid: false }
  return { valid: true, participantName: row.participant_name, courseTitle: row.course_title, organizationName: row.organization_name, completedOn: row.completed_on }
}
