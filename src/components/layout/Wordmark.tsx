import { Link } from 'react-router'
import { cx } from '../../lib/cx'
import styles from './Wordmark.module.css'

type WordmarkProps = {
  /** White version for the navy sidebar. */
  light?: boolean
  /** Where clicking the wordmark goes. Default "/". */
  to?: string
}

export function Wordmark({ light = false, to = '/' }: WordmarkProps) {
  return (
    <Link to={to} className={cx(styles.wordmark, light && styles.light)} aria-label="AQS E-Learning home">
      <span className={styles.name} aria-hidden="true">
        AQS
      </span>
      <span className={styles.sub} aria-hidden="true">
        E-LEARNING
      </span>
    </Link>
  )
}
