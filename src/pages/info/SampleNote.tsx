import type { ReactNode } from 'react'
import { Banner } from '../../components/ui'
import styles from './SampleNote.module.css'

/*
 * Marks for SAMPLE CONTENT on the About AQS and Contact pages (owner instruction, 15 November 2026;
 * content/public-site.sample.ts). Development builds only: in a production build both render nothing,
 * and `npm run check:build` fails if the mark or the sample text ships.
 */

/** The page-level notice, shown once under the page title. */
export function SampleContentBanner() {
  if (!import.meta.env.DEV) return null
  return (
    <div className={styles.banner} data-sample-content="notice">
      <Banner tone="warning">
        <strong>Sample content · not approved.</strong> The text marked Sample on this page is illustrative, for design review
        only. It is not AQS information and is not published.
      </Banner>
    </div>
  )
}

/** One piece of sample content, with its "Sample" mark. `as` picks the wrapping element. */
export function SampleNote({ children, as: Tag = 'p', className }: { children: ReactNode; as?: 'p' | 'span' | 'div'; className?: string }) {
  if (!import.meta.env.DEV) return null
  return (
    <Tag className={className} data-sample-content="true">
      <span className={styles.mark}>Sample</span> {children}
    </Tag>
  )
}
