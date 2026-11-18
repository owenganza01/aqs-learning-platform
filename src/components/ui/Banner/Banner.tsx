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
  /**
   * The banner announces itself (role status, or alert for danger). Set false when it sits inside
   * a live region that is already on the page (ActionFeedback), so it is announced once.
   */
  live?: boolean
}

/**
 * Status messages are announced politely to screen readers; "danger" banners
 * are announced immediately (role="alert").
 */
export function Banner({ tone = 'info', icon, children, action, flush = false, live = true }: BannerProps) {
  return (
    <div
      className={cx(styles.banner, styles[tone], flush && styles.flush)}
      role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
    >
      {icon ? <Icon name={icon} size={20} className={styles.icon} /> : null}
      <div className={styles.message}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
