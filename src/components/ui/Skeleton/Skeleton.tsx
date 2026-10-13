import type { CSSProperties } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Skeleton.module.css'

type SkeletonProps = {
  shape?: 'rect' | 'text' | 'circle'
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  className?: string
}

/**
 * A single placeholder block. It is hidden from screen readers; wrap a group
 * of skeletons in an element with aria-busy="true" and a text label such as
 * "Loading your courses" so assistive technology knows content is loading.
 */
export function Skeleton({ shape = 'rect', width = '100%', height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, shape === 'text' && styles.text, shape === 'circle' && styles.circle, className)}
      style={{ width, height: height ?? (shape === 'text' ? 12 : 48) }}
    />
  )
}
