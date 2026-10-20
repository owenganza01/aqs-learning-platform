import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Avatar, Icon } from '../ui'
import type { CurrentUser, NavItem } from './types'
import { Wordmark } from './Wordmark'
import styles from './AppShell.module.css'

/** Elements a keyboard user can reach, used to keep focus inside the open drawer. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type AppShellProps = {
  /** Sidebar links for this role (learner, instructor, admin…). */
  navItems: NavItem[]
  user: CurrentUser
  /** Organization context shown in the header, e.g. "ABC Corporation · Instructor workspace". */
  workspace?: { title: string; subtitle?: string }
  /** Placeholder for the header search box. Omit to hide search. */
  searchPlaceholder?: string
  /** Help card text, which differs per role ("Here to help you learn / teach / manage"). */
  helpTitle?: string
  /** Full-width strip under the header, e.g. an offline <Banner flush>. */
  banner?: ReactNode
  /**
   * Show notifications, "Visit help center" and "Sign out" as unavailable
   * (dimmed, not clickable) until their behaviour exists. Default false.
   */
  unavailableActions?: boolean
  children: ReactNode
  mainId?: string
}

/**
 * NOTE (Phase 1): search, notifications, the user menu and "Sign out" are
 * presentational only. They are wired to real behaviour in later phases.
 */
export function AppShell({
  navItems,
  user,
  workspace,
  searchPlaceholder,
  helpTitle = 'Here to help you learn',
  banner,
  unavailableActions = false,
  children,
  mainId = 'main-content',
}: AppShellProps) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarId = useId()
  const searchId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const wasOpenRef = useRef(false)

  // On small screens the open drawer is a modal dialog. Escape closes it, and Tab
  // and Shift+Tab stay inside it. The page behind it is made inert (see below).
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }
      const drawer = sidebarRef.current
      if (event.key !== 'Tab' || !drawer) return
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const insideDrawer = drawer.contains(document.activeElement)
      if (event.shiftKey && (!insideDrawer || document.activeElement === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!insideDrawer || document.activeElement === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Move focus into the drawer when it opens, and back to the menu button when it closes
  // by any route (Escape, close button, backdrop, or choosing a link). At desktop width the
  // menu button is hidden, so focus goes to the page content instead.
  useEffect(() => {
    if (drawerOpen) {
      wasOpenRef.current = true
      closeButtonRef.current?.focus()
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      const menuVisible = !!menuButtonRef.current && getComputedStyle(menuButtonRef.current).display !== 'none'
      const target = menuVisible ? menuButtonRef.current : document.getElementById(mainId)
      target?.focus()
    }
  }, [drawerOpen, mainId])

  // The drawer only exists below 1024px (see AppShell.module.css). Close it if the window
  // grows, so the page is never left inert while the sidebar is shown inline.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (desktop.matches) setDrawerOpen(false)
    }
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [])

  const isActive = (item: NavItem) =>
    item.active ?? (pathname === item.to || pathname.startsWith(`${item.to}/`))

  return (
    <div className={styles.shell} data-drawer={drawerOpen ? 'open' : 'closed'}>
      <a className="skip-link" href={`#${mainId}`} inert={drawerOpen}>
        Skip to content
      </a>

      <aside
        ref={sidebarRef}
        id={sidebarId}
        className={`${styles.sidebar} on-dark`}
        aria-label="Sidebar"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
      >
        <div className={styles.sidebarTop}>
          <Wordmark light />
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="close" size={22} label="Close menu" />
          </button>
        </div>

        <nav aria-label="Workspace">
          <ul className={styles.navList}>
            {navItems.map((item) => (
              <li key={item.to}>
                {item.unavailable ? (
                  <span className={`${styles.navItem} ${styles.navItemUnavailable}`} aria-disabled="true">
                    {item.icon ? <Icon name={item.icon} size={20} /> : null}
                    {item.label}
                    <span className="visually-hidden"> (not available yet)</span>
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className={styles.navItem}
                    aria-current={isActive(item) ? 'page' : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    {item.icon ? <Icon name={item.icon} size={20} /> : null}
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.helpCard}>
          <Icon name="help" size={24} />
          <p className={styles.helpTitle}>{helpTitle}</p>
          <p className={styles.helpText}>Find answers or get support from our learning team.</p>
          {unavailableActions ? (
            <span className={`${styles.helpLink} ${styles.unavailable}`} aria-disabled="true">
              Visit help center <Icon name="arrowRight" size={16} />
              <span className="visually-hidden"> (not available yet)</span>
            </span>
          ) : (
            <Link to="/help" className={styles.helpLink}>
              Visit help center <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </div>

        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.signOut} disabled={unavailableActions}>
            <Icon name="logOut" size={20} />
            Sign out
          </button>
          <p className={styles.copyright}>© {new Date().getFullYear()} AQS E-Learning</p>
        </div>
      </aside>

      <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <div className={styles.main} inert={drawerOpen}>
        <header className={styles.header}>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={drawerOpen}
            aria-controls={sidebarId}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" size={22} label="Open menu" />
          </button>

          {workspace ? (
            <div className={styles.workspace}>
              <p className={styles.workspaceTitle}>{workspace.title}</p>
              {workspace.subtitle ? <p className={styles.workspaceSubtitle}>{workspace.subtitle}</p> : null}
            </div>
          ) : null}

          {searchPlaceholder ? (
            <form className={styles.search} role="search" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor={searchId} className="visually-hidden">
                Search
              </label>
              <Icon name="search" size={18} className={styles.searchIcon} />
              <input id={searchId} type="search" className={styles.searchInput} placeholder={searchPlaceholder} />
            </form>
          ) : null}

          <div className={styles.headerEnd}>
            <button type="button" className={styles.iconButton} disabled={unavailableActions}>
              <Icon name="bell" size={22} label={unavailableActions ? 'Notifications (not available yet)' : 'Notifications'} />
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <div className={styles.user}>
              <Avatar name={user.name} decorative />
              <div className={styles.userText}>
                <p className={styles.userName}>{user.name}</p>
                <p className={styles.userRole}>{user.roleLabel}</p>
              </div>
              <span className="visually-hidden">
                Signed in as {user.name}, {user.roleLabel}
              </span>
            </div>
          </div>
        </header>

        {banner}

        <main id={mainId} className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
