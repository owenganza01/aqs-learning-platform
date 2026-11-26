/*
 * Reading every row of a list that may exceed the Data API's 1,000-row cap (review, 23 November 2026: the Org
 * Admin dashboard and invitations page counted members and invitations from a single request, which stops
 * silently at 1,000 rows). Pure, so tests/unit/paging.test.mjs checks it without a database.
 *
 * fetchPage(from, to) must return the rows from..to inclusive of a stably ordered result. Pages are fetched one
 * after another until a page comes back shorter than requested. maxRows guards against an unbounded loop.
 */
export const PAGE_ROWS = 1000

export class TooManyRowsError extends Error {
  constructor(limit: number) {
    super(`More than ${limit.toLocaleString('en-GB')} rows; narrow the list.`)
    this.name = 'TooManyRowsError'
  }
}

export async function collectPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageRows = PAGE_ROWS,
  maxRows = 50_000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageRows) {
    const page = await fetchPage(from, from + pageRows - 1)
    out.push(...page)
    if (page.length < pageRows) return out
    if (out.length >= maxRows) throw new TooManyRowsError(maxRows)
  }
}
