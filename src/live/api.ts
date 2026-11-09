import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/*
 * Thin access layer for live data. Every write goes through a database function (T5); the
 * database decides who may do what (row rules and checked functions), and this file only
 * turns its answers into errors the pages can show. Hiding a button is never the security
 * control: a refused call comes back as AppError('forbidden').
 */

export type AppErrorKind = 'forbidden' | 'invalid' | 'rule' | 'not-found' | 'network' | 'unavailable' | 'unknown'

export class AppError extends Error {
  readonly kind: AppErrorKind
  constructor(kind: AppErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'AppError'
  }
}

const GENERIC: Record<AppErrorKind, string> = {
  forbidden: 'You do not have permission to do that.',
  invalid: 'Please check what you entered and try again.',
  rule: 'That could not be done.',
  'not-found': 'We could not find that.',
  network: 'We could not reach the server. Check your connection and try again.',
  unavailable: 'The service is not configured for this site.',
  unknown: 'Something went wrong. Please try again.',
}

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null }

/** Messages raised by AQS functions start with "AQS: " and are written for people. */
function friendly(message: string | undefined): string | null {
  if (!message) return null
  const match = /^AQS: (.+)$/s.exec(message.trim())
  return match ? match[1] : null
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof TypeError) return new AppError('network', GENERIC.network)
  const db = (error ?? {}) as DbError
  const text = friendly(db.message)
  switch (db.code) {
    case '42501':
      // A refusal never says why beyond what the function chose to say (no existence leaks).
      return new AppError('forbidden', text && text !== 'not permitted' ? text : GENERIC.forbidden)
    case '22023':
    case '23514':
    case '22P02':
      return new AppError('invalid', text ?? GENERIC.invalid)
    case 'P0001':
      return new AppError('rule', text ?? GENERIC.rule)
    case 'PGRST116':
      return new AppError('not-found', GENERIC['not-found'])
    default:
      return new AppError('unknown', text ?? GENERIC.unknown)
  }
}

export function client(): SupabaseClient {
  if (!supabase) throw new AppError('unavailable', GENERIC.unavailable)
  return supabase
}

/** Call a database function and return its result, or throw an AppError. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let result
  try {
    result = await client().rpc(fn, args ?? {})
  } catch (error) {
    throw toAppError(error)
  }
  if (result.error) throw toAppError(result.error)
  return result.data as T
}

/** Run a table query built from the client and return its rows, or throw an AppError. */
export async function query<T>(
  build: (db: SupabaseClient) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  let result
  try {
    result = await build(client())
  } catch (error) {
    throw toAppError(error)
  }
  if (result.error) throw toAppError(result.error)
  return result.data as T
}

/** Call an Edge Function with the signed-in person's token. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  let result
  try {
    result = await client().functions.invoke(name, { body })
  } catch (error) {
    throw toAppError(error)
  }
  if (result.error) {
    // Edge Functions answer { error: { kind, message } } with a 4xx status.
    const context = (result.error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: { kind?: AppErrorKind; message?: string } }
        if (payload.error?.kind) {
          throw new AppError(payload.error.kind, payload.error.message ?? GENERIC[payload.error.kind])
        }
      } catch (inner) {
        if (inner instanceof AppError) throw inner
      }
    }
    throw new AppError('unknown', GENERIC.unknown)
  }
  return result.data as T
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message
}
