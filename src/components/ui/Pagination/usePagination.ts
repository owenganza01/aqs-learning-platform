import { useState } from 'react'

export interface PageState<T> {
  /** The rows on the current page. */
  items: T[]
  /** 1-based current page, always within 1..pageCount. */
  page: number
  pageCount: number
  /** 1-based position of the first and last row shown (0 and 0 when there are no rows). */
  start: number
  end: number
  total: number
  setPage: (page: number) => void
}

/**
 * Client-side pagination over an in-memory list (sample data in the development build).
 *
 * `resetKey` describes the current search and filters. When it changes, the list starts again at page 1,
 * so a filter never leaves the user on a page that no longer exists. The page is also clamped when the
 * list shrinks for another reason. No effect or extra render is needed: the reset is derived.
 */
export function usePagination<T>(rows: T[], pageSize: number, resetKey = ''): PageState<T> {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const requested = state.key === resetKey ? state.page : 1
  const page = Math.min(Math.max(1, requested), pageCount)
  const startIndex = (page - 1) * pageSize
  const items = rows.slice(startIndex, startIndex + pageSize)
  return {
    items,
    page,
    pageCount,
    start: rows.length === 0 ? 0 : startIndex + 1,
    end: startIndex + items.length,
    total: rows.length,
    setPage: (next: number) => setState({ key: resetKey, page: Math.min(Math.max(1, next), pageCount) }),
  }
}
