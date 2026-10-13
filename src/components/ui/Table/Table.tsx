import type { ReactNode } from 'react'
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
}

export function Table<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nothing to show yet.',
  footer,
}: TableProps<Row>) {
  const alignClass = (align?: TableColumn<Row>['align']) =>
    align === 'right' ? styles.alignRight : align === 'center' ? styles.alignCenter : undefined

  return (
    <div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={captionVisible ? styles.caption : 'visually-hidden'}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cx(styles.th, alignClass(column.align))}>
                  {column.hideHeader ? <span className="visually-hidden">{column.header}</span> : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)} className={styles.row}>
                  {columns.map((column) => (
                    <td key={column.key} className={cx(styles.td, alignClass(column.align))}>
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
