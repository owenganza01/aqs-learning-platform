import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Avatar, Icon } from '../ui'
import type { CurrentUser, NavItem } from './types'
import { Wordmark } from './Wordmark'
import styles from './AppShell.module.css'

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
  children,
  mainId = 'main-content',
}: AppShellProps) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarId = useId()
  const searchId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Close the mobile drawer with the Escape key and return focus to the menu button.
  useEffect(() => {
    if (!drawerOpen) return
    closeButtonRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const isActive = (item: NavItem) =>
    item.active ?? (pathname === item.to || pathname.startsWith(`${item.to}/`))

  return (
    <div className={styles.shell} data-drawer={drawerOpen ? 'open' : 'closed'}>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>

      <aside id={sidebarId} className={`${styles.sidebar} on-dark`} aria-label="Sidebar">
        <div className={styles.sidebarTop}>
          <Wordmark light />
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={() => {
              setDrawerOpen(false)
              menuButtonRef.current?.focus()
            }}
          >
            <Icon name="close" size={22} label="Close menu" />
          </button>
        </div>

        <nav aria-label="Workspace">
          <ul className={styles.navList}>
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={styles.navItem}
                  aria-current={isActive(item) ? 'page' : undefined}
                  onClick={() => setDrawerOpen(false)}
                >
                  {item.icon ? <Icon name={item.icon} size={20} /> : null}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.helpCard}>
          <Icon name="help" size={24} />
          <p className={styles.helpTitle}>{helpTitle}</p>
          <p className={styles.helpText}>Find answers or get support from our learning team.</p>
          <Link to="/help" className={styles.helpLink}>
            Visit help center <Icon name="arrowRight" size={16} />
          </Link>
        </div>

        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.signOut}>
            <Icon name="logOut" size={20} />
            Sign out
          </button>
          <p className={styles.copyright}>© {new Date().getFullYear()} AQS E-Learning</p>
        </div>
      </aside>

      <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <div className={styles.main}>
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
            <button type="button" className={styles.iconButton}>
              <Icon name="bell" size={22} label="Notifications" />
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
