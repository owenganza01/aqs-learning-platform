import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './Banner.module.css'

type BannerTone = 'info' | 'warning' | 'success' | 'danger'

type BannerProps = {
  tone?: BannerTone
  /**
   * Optional icon. The designs only show one for status banners that need it
   * (offline: wifiOff, syncing: refresh). No decorative icon by default.
   */
  icon?: IconName
  children: ReactNode
  /** Optional button or link on the right. */
  action?: ReactNode
  /** Edge-to-edge strip with square corners (sits directly under a header). */
  flush?: boolean
}

/**
 * Status messages are announced politely to screen readers; "danger" banners
 * are announced immediately (role="alert").
 */
export function Banner({ tone = 'info', icon, children, action, flush = false }: BannerProps) {
  return (
    <div className={cx(styles.banner, styles[tone], flush && styles.flush)} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon ? <Icon name={icon} size={20} className={styles.icon} /> : null}
      <div className={styles.message}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
