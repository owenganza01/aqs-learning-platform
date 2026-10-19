import { useId, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, Icon } from '../ui'
import type { NavItem } from './types'
import { Wordmark } from './Wordmark'
import styles from './PublicLayout.module.css'

// Navigation labels from the Landing design. Courses and For Organizations link to
// sections of the landing page, because their own routes are not built yet. Pages
// that are not built are marked unavailable (shown as dimmed text, not a link).
const defaultNav: NavItem[] = [
  { label: 'Courses', to: '/#courses' },
  { label: 'For Organizations', to: '/#for-organizations' },
  { label: 'About', to: '/about', unavailable: true },
  { label: 'Contact', to: '/contact', unavailable: true },
]

const footerColumns: Array<{ heading: string; links: NavItem[] }> = [
  {
    heading: 'Platform',
    links: [
      { label: 'Courses', to: '/#courses' },
      { label: 'For Organizations', to: '/#for-organizations' },
      { label: 'About', to: '/about', unavailable: true },
      { label: 'Contact', to: '/contact', unavailable: true },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Our Story', to: '/about', unavailable: true },
      { label: 'Instructors', to: '/instructors', unavailable: true },
      { label: 'Careers', to: '/careers', unavailable: true },
      { label: 'Blog', to: '/blog', unavailable: true },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy', unavailable: true },
      { label: 'Terms', to: '/terms', unavailable: true },
      { label: 'Cookie Policy', to: '/cookies', unavailable: true },
    ],
  },
]

type PublicLayoutProps = {
  children: ReactNode
  navItems?: NavItem[]
  /**
   * Contact lines for the footer. Left empty until AQS confirms real details —
   * the design shows placeholders ("@aqslearning.com", "+250 888 888 888").
   */
  contactLines?: string[]
  /** id of the <main> element (target of the "Skip to content" link). */
  mainId?: string
}

export function PublicLayout({
  children,
  navItems = defaultNav,
  contactLines = [],
  mainId = 'main-content',
}: PublicLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const menuId = useId()
  // Close the mobile menu once a link in it is chosen (no effect on desktop,
  // where the menu is never open).
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className={styles.page}>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <header className={styles.header} data-open={menuOpen}>
        <div className={styles.headerInner}>
          <Wordmark />
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={22} label={menuOpen ? 'Close menu' : 'Open menu'} />
          </button>
          <nav className={styles.nav} aria-label="Main" id={menuId}>
            <ul className={styles.navList}>
              {navItems.map((item) => (
                <li key={item.to}>
                  {item.unavailable ? (
                    <span className={`${styles.navLink} ${styles.unavailable}`} aria-disabled="true">
                      {item.label}
                      <span className="visually-hidden"> (not available yet)</span>
                    </span>
                  ) : (
                    <Link
                      to={item.to}
                      className={styles.navLink}
                      onClick={closeMenu}
                      aria-current={(item.active ?? pathname === item.to) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.actions}>
            {/* Sign-in is not built yet (D11, D15), so both actions are shown as unavailable. */}
            <span className={`${styles.signIn} ${styles.unavailable}`} aria-disabled="true">
              Sign in
              <span className="visually-hidden"> (not available yet)</span>
            </span>
            <Button disabled className={styles.cta}>
              Get started
              <span className="visually-hidden"> (not available yet)</span>
            </Button>
          </div>
        </div>
      </header>

      <main id={mainId} className={styles.main} tabIndex={-1}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerGrid}>
            <div className={styles.footerAbout}>
              <Wordmark />
              <p>Practical courses, expert instruction, and flexible pathways for individuals and teams.</p>
              {contactLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            {footerColumns.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h2 className={styles.footerHeading}>{column.heading}</h2>
                <ul className={styles.footerList}>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.unavailable ? (
                        <span className={`${styles.footerLink} ${styles.unavailable}`} aria-disabled="true">
                          {link.label}
                          <span className="visually-hidden"> (not available yet)</span>
                        </span>
                      ) : (
                        <Link to={link.to} className={styles.footerLink}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p className={styles.copyright}>© {new Date().getFullYear()} AQS E-Learning. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
