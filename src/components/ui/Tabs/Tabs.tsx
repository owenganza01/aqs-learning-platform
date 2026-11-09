import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Tabs.module.css'

export type TabItem = {
  id: string
  label: string
  /** Optional number after the label, e.g. course counts. */
  count?: number
  content: ReactNode
}

type TabsProps = {
  /** Describes the group of tabs for screen readers, e.g. "Course sections". */
  label: string
  items: TabItem[]
  variant?: 'underline' | 'pill'
  /** Controlled mode: the selected tab id … */
  value?: string
  /** … and a callback when the user picks another tab. */
  onChange?: (id: string) => void
  defaultValue?: string
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): Left/Right arrow keys move between
 * tabs, Home/End jump to the first/last, and only the selected tab is in the
 * Tab-key order.
 */
export function Tabs({ label, items, variant = 'underline', value, onChange, defaultValue }: TabsProps) {
  const baseId = useId()
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.id)
  const selectedId = value ?? internalValue
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const select = (id: string) => {
    if (value === undefined) setInternalValue(id)
    onChange?.(id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (next === null) return
    event.preventDefault()
    select(items[next].id)
    tabRefs.current[next]?.focus()
  }

  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  return (
    <div>
      <div role="tablist" aria-label={label} className={cx(styles.tablist, styles[variant])}>
        {items.map((item, index) => {
          const isSelected = item.id === selected?.id
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
              {item.count !== undefined ? <span className={styles.count}>{item.count}</span> : null}
            </button>
          )
        })}
      </div>
      {selected ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          tabIndex={0}
          className={styles.panel}
        >
          {selected.content}
        </div>
      ) : null}
    </div>
  )
}
