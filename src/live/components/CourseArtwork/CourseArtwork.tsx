import { cx } from '../../../lib/cx'
import { courseInitials } from './course-initials'
import styles from './CourseArtwork.module.css'

/*
 * Task 8-2: the picture shown for a course without a thumbnail, in AQS colours instead of an empty
 * box: the course's initials in a navy badge on the tile's tint, over a faint dot pattern (the
 * landing page's network motif). Decorative: the course title is always shown next to it.
 */
export function CourseArtwork({ title, tone = 'light', className }: { title: string; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <div className={cx(styles.artwork, tone === 'dark' && styles.dark, className)} aria-hidden="true">
      <span className={styles.initials}>{courseInitials(title)}</span>
    </div>
  )
}
