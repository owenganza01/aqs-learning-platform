import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ButtonLink, Icon } from '../ui'
import type { NavItem } from './types'
import { Wordmark } from './Wordmark'
import { GET_STARTED_PATH, publicFooterColumns, publicHeaderNav } from '../../lib/public-navigation'
import styles from './PublicLayout.module.css'
import { useAuth } from '../../lib/auth-context'
import { useOptionalSession, workspacesFor } from '../../live/session-context'
import { PublicAccountMenu, type PublicWorkspaceLink } from './PublicAccountMenu'

// Navigation (landing page Concept C, approved 10 November 2026).
// The header knows whether someone is signed in: signed-in people get
// "My workspace" and an account menu instead of Sign in and Get started.
const defaultNav: NavItem[] = publicHeaderNav()

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

const footerColumns = publicFooterColumns()

type HeaderAccount =
  | { state: 'unavailable' }
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; name: string; email: string; workspaces: PublicWorkspaceLink[] }

/** Who the header is for. Reads the session only; it never signs anyone in or changes access. */
function useHeaderAccount(): HeaderAccount {
  const auth = useAuth()
  const session = useOptionalSession()
  if (auth.loading) return { state: 'loading' }
  if (!auth.session) return { state: 'signed-out' }
  const fallbackEmail = auth.session.user.email ?? ''
  if (!session || session.me.state === 'error') return { state: 'signed-in', name: '', email: fallbackEmail, workspaces: [] }
  if (session.me.state === 'loading') return { state: 'loading' }
  const me = session.me.data
  if (!me) return { state: 'signed-in', name: '', email: fallbackEmail, workspaces: [] }
  // A deactivated account is offered no workspaces; the pages themselves refuse it anyway.
  const workspaces = me.status === 'active' ? workspacesFor(me).map(({ label, to }) => ({ label, to })) : []
  return { state: 'signed-in', name: me.fullName, email: me.email, workspaces }
}

export function PublicLayout({
  children,
  navItems = defaultNav,
  contactLines = [],
  mainId = 'main-content',
}: PublicLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const account = useHeaderAccount()
  const { signOut } = useAuth()
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  // The element that last had focus. When the layout changes, focus can fall to <body>
  // because that element was hidden, so this records where focus was.
  const lastFocusedRef = useRef<Element | null>(null)
  // Close the mobile menu once a link in it is chosen (no effect on desktop,
  // where the menu is never open).
  const closeMenu = () => setMenuOpen(false)

  // Escape closes the open mobile menu. Focus returns to the toggle, unless the toggle is
  // hidden (desktop width), in which case the menu just closes.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      const toggle = menuButtonRef.current
      if (toggle && getComputedStyle(toggle).display !== 'none') toggle.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      lastFocusedRef.current = event.target instanceof Element ? event.target : null
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  // The mobile menu and its toggle exist only below 1024px (PublicLayout.module.css uses
  // max-width: 1023px). When the layout crosses that breakpoint, close the menu and keep
  // keyboard focus on a visible element, without moving focus when it is still visible.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      // Focus counts as lost when it is on <body>, or still on an element that is now hidden.
      // The browser may not have moved focus yet when this event runs.
      const current = document.activeElement
      const focusLost = !current || current === document.body || current.getClientRects().length === 0
      const previous = lastFocusedRef.current
      if (desktop.matches) {
        setMenuOpen(false)
        // The toggle had focus and is now hidden, so move focus to the content.
        if (focusLost && previous === menuButtonRef.current) document.getElementById(mainId)?.focus()
      } else if (focusLost && previous?.closest('header') && previous.getClientRects().length === 0) {
        // A desktop navigation link had focus and is now hidden, so move focus to the mobile
        // toggle. The menu stays closed.
        menuButtonRef.current?.focus()
      }
    }
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [mainId])

  return (
    <div className={styles.page}>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <header className={styles.header} data-open={menuOpen}>
        <div className={styles.headerInner}>
          <Wordmark />
          <div className={styles.mobileBar}>
            {account.state === 'signed-in' ? (
              <ButtonLink to="/home" size="sm" variant="secondary" className={styles.mobileCta} onClick={closeMenu}>
                My workspace
              </ButtonLink>
            ) : null}
            <button
              ref={menuButtonRef}
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} size={22} label={menuOpen ? 'Close menu' : 'Open menu'} />
            </button>
          </div>
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
            {account.state === 'signed-in' ? (
              // Mobile menu only (hidden at desktop width, where the account menu shows the same list).
              <div className={styles.mobileAccount}>
                {account.workspaces.length > 0 ? (
                  <>
                    <p className={styles.mobileGroupLabel}>Your workspaces</p>
                    <ul className={styles.navList}>
                      {account.workspaces.map((workspace) => (
                        <li key={workspace.to}>
                          <Link to={workspace.to} className={styles.navLink} onClick={closeMenu}>
                            {workspace.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <button
                  type="button"
                  className={`${styles.navLink} ${styles.mobileSignOut}`}
                  onClick={() => {
                    closeMenu()
                    void signOut()
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </nav>
          <div className={styles.actions} data-account={account.state}>
            {account.state === 'signed-out' || account.state === 'unavailable' ? (
              <>
                <Link to="/sign-in" className={styles.signIn} onClick={closeMenu}>
                  Sign in
                </Link>
                <ButtonLink to={GET_STARTED_PATH} className={styles.cta}>
                  Get started
                </ButtonLink>
              </>
            ) : null}
            {account.state === 'signed-in' ? (
              <>
                <ButtonLink to="/home" variant="secondary" size="sm" className={styles.workspaceLink}>
                  My workspace
                </ButtonLink>
                <PublicAccountMenu
                  name={account.name}
                  email={account.email}
                  workspaces={account.workspaces}
                  onSignOut={() => void signOut()}
                />
              </>
            ) : null}
            {account.state === 'loading' ? <span className={styles.actionsPending} aria-hidden="true" /> : null}
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
              <p>Training for organizations and courses for everyone.</p>
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
