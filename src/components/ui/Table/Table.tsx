import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Table.module.css'

export type TableColumn<Row> = {
  /** Unique key for the column. */
  key: string
  header: ReactNode
  /** How to show this column's value for a row. */
  render: (row: Row) => ReactNode
  align?: 'left' | 'center' | 'right'
  /** Header visible only to screen readers (e.g. an "Actions" column). */
  hideHeader?: boolean
}

type TableProps<Row> = {
  /** Describes the table for screen readers. Shown visually only if captionVisible. */
  caption: string
  captionVisible?: boolean
  columns: Array<TableColumn<Row>>
  rows: Row[]
  /** Returns a stable unique id for each row. */
  getRowKey: (row: Row) => string
  /** Shown when there are no rows. */
  emptyMessage?: ReactNode
  /** Footer, e.g. "Showing 5 of 5 organizations". */
  footer?: ReactNode
  /**
   * Assignment 3.6: "compact" tightens the rows at 1024 px and wider, for the Platform Control Center's
   * scanning tables. Below 1024 px every table is cards, whatever the density.
   */
  density?: 'comfortable' | 'compact'
}

export function Table<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nothing to show yet.',
  footer,
  density = 'comfortable',
}: TableProps<Row>) {
  // WCAG 2.1.1 / axe scrollable-region-focusable (M5): when the table is wider than its box
  // (narrow screens), keyboard users must be able to reach and scroll it, so the scroll box
  // becomes a focusable, labelled region. When it fits, it adds no extra tab stop.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [rows.length, columns.length])

  // Phones and tablets (Phase 3 of the refinement plan): each row shows as a card, with the column name beside each
  // value (data-label) so nothing has to be scrolled sideways. Explicit roles keep the table's meaning for
  // screen readers when the phone styles change how the cells are laid out.
  const labelOf = (column: TableColumn<Row>) =>
    !column.hideHeader && typeof column.header === 'string' ? column.header : undefined

  const alignClass = (align?: TableColumn<Row>['align']) =>
    align === 'right' ? styles.alignRight : align === 'center' ? styles.alignCenter : undefined

  return (
    <div>
      <div
        ref={scrollRef}
        className={styles.scroll}
        {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': `${caption} (scrolls sideways)` } : {})}
      >
        <table className={cx(styles.table, density === 'compact' && styles.compact)} role="table" data-density={density}>
          <caption className={captionVisible ? styles.caption : 'visually-hidden'}>{caption}</caption>
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((column) => (
                <th key={column.key} scope="col" role="columnheader" className={cx(styles.th, alignClass(column.align))}>
                  {column.hideHeader ? <span className="visually-hidden">{column.header}</span> : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.length === 0 ? (
              <tr role="row">
                <td role="cell" className={styles.emptyCell} colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)} role="row" className={styles.row}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      role="cell"
                      data-label={labelOf(column)}
                      className={cx(styles.td, alignClass(column.align))}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  )
}
