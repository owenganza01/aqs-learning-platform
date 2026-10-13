import { useId } from 'react'
import { cx } from '../../../lib/cx'
import styles from './ProgressBar.module.css'

type ProgressBarProps = {
  /** 0–100 */
  value: number
  /** Visible text on the left, e.g. "In progress". Also used for screen readers. */
  label: string
  /** Hide the label row (the label is still announced to screen readers). */
  hideLabel?: boolean
  /** Shows "42%" on the right. Default true. */
  showValue?: boolean
  tone?: 'default' | 'success'
}

export function ProgressBar({ value, label, hideLabel = false, showValue = true, tone = 'default' }: ProgressBarProps) {
  const id = useId()
  const clamped = Math.min(100, Math.max(0, Math.round(value)))

  return (
    <div className={cx(styles.wrapper, tone === 'success' && styles.success)}>
      {!hideLabel ? (
        <div className={styles.labelRow}>
          <span id={id} className={styles.label}>
            {label}
          </span>
          {showValue ? (
            <span className={styles.value} aria-hidden="true">
              {clamped}%
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        {...(hideLabel ? { 'aria-label': label } : { 'aria-labelledby': id })}
      >
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
