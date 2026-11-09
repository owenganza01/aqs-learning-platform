import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import styles from './Pagination.module.css'

type PaginationProps = {
  page: number
  pageCount: number
  start: number
  end: number
  total: number
  onPageChange: (page: number) => void
  /** Plural noun for the result count, e.g. "members". */
  noun: string
  /** Singular noun, used when there is exactly one result, e.g. "member". */
  singular: string
  /** What the controls page through, for screen readers, e.g. "Members". */
  label: string
  /** Optional suffix for the count, e.g. "· 30 in total" when a filter is on. */
  note?: string
}

/** Page numbers to show: all of them up to 7 pages, otherwise first, last and the current neighbourhood. */
function pageList(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((p) => pages.add(p))
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap')
    out.push(p)
  })
  return out
}

/**
 * Result count plus Previous, page numbers and Next, as drawn on the Members design
 * (`pending and archived/General Admin/Members`): chevron arrows, plain numbers, the current page on a
 * pale orange tint. The controls appear only when there is more than one
 * page; the count is always shown. Previous and Next use aria-disabled (not disabled) at the ends, so
 * keyboard focus is not lost when the user reaches the first or last page.
 */
export function Pagination({ page, pageCount, start, end, total, onPageChange, noun, singular, label, note }: PaginationProps) {
  const range = start === end ? String(start) : `${start}–${end}`
  const summary = total === 0 ? `No ${noun} to show` : `Showing ${range} of ${total} ${total === 1 ? singular : noun}`
  const go = (next: number) => {
    if (next < 1 || next > pageCount || next === page) return
    onPageChange(next)
  }
  return (
    <div className={styles.bar}>
      <p className={styles.summary} aria-live="polite">
        {summary}
        {note ? <span className={styles.note}> {note}</span> : null}
      </p>
      {pageCount > 1 ? (
        <nav aria-label={`${label} pages`}>
          <ul className={styles.list}>
            <li>
              <button
                type="button"
                className={cx(styles.step, styles.control)}
                aria-disabled={page === 1}
                onClick={() => go(page - 1)}
              >
                <Icon name="chevronLeft" size={18} />
                <span className="visually-hidden">Previous page</span>
              </button>
            </li>
            {pageList(page, pageCount).map((item, index) =>
              item === 'gap' ? (
                <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    className={cx(styles.number, styles.control)}
                    aria-current={item === page ? 'page' : undefined}
                    onClick={() => go(item)}
                  >
                    <span className="visually-hidden">Page </span>
                    {item}
                  </button>
                </li>
              ),
            )}
            <li>
              <button
                type="button"
                className={cx(styles.step, styles.control)}
                aria-disabled={page === pageCount}
                onClick={() => go(page + 1)}
              >
                <Icon name="chevronRight" size={18} />
                <span className="visually-hidden">Next page</span>
              </button>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  )
}
