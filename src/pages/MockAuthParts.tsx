import type { ReactNode } from 'react'
import { Banner } from '../components/ui'
import styles from './MockAuth.module.css'

/*
 * Shared pieces of the development-only mock auth screens (decision D27). Presentation only:
 * nothing here calls a provider, an API, a session or storage (decision D15).
 */

export const DEMO_NOTICE = 'Demo only. Sign-in is not available yet. This page makes no sign-in or provider calls.'

export const HERO_PLACEHOLDER = 'Hero photo placeholder (pending approved asset)'

/** The visible demo-only disclosure. `id` lets a control point to it with aria-describedby. */
export function MockAuthNotice({ id }: { id: string }) {
  return (
    <div className={styles.notice}>
      <Banner tone="info">
        <span id={id}>{DEMO_NOTICE}</span>
      </Banner>
    </div>
  )
}

/** A link or control without an approved destination (D24): dimmed, not focusable, labelled. */
export function UnavailableItem({ children }: { children: ReactNode }) {
  return (
    <span className={styles.unavailable} aria-disabled="true">
      {children}
      <span className="visually-hidden"> (not available yet)</span>
    </span>
  )
}

/** The card footer shared by the mock auth screens. Every item here is unavailable. */
export function MockAuthFooter() {
  return (
    <div className={styles.footer}>
      <p className={styles.footerRow}>
        <UnavailableItem>Privacy Policy</UnavailableItem>
        <UnavailableItem>Terms</UnavailableItem>
      </p>
      <p className={styles.footerRow}>
        Want to teach? <UnavailableItem>Learn about teaching.</UnavailableItem>
      </p>
    </div>
  )
}
