import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { cx } from '../../lib/cx'
import { Avatar, Icon } from '../ui'
import type { CurrentUser, NavItem, WorkspaceIdentity, WorkspaceKind } from './types'
import { Wordmark } from './Wordmark'
import styles from './AppShell.module.css'

/** Elements a keyboard user can reach, used to keep focus inside the open drawer. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type AppShellProps = {
  /** Sidebar links for this role (learner, instructor, admin…). */
  navItems: NavItem[]
  user: CurrentUser
  /**
   * Workspace identity shown in the header at every width: the workspace name, what kind of workspace
   * it is, an optional tile (the organization's initials or the platform mark) and an optional scope tag.
   */
  workspace?: WorkspaceIdentity
  /**
   * Which workspace this is (Unified Refinement Plan, Phase 2). It selects the shell's colours
   * (styles/tokens.css) and nothing else: access is decided by the route guards and the database.
   * Default 'learner', the brand baseline.
   */
  workspaceKind?: WorkspaceKind
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
  /**
   * Live pages (WP1 task 1-3): leave out the help card and the notification bell entirely until they
   * are built, instead of showing them dimmed. Design previews keep them. Default false.
   */
  hideUnbuilt?: boolean
  /** Live pages: signs the person out. When given, "Sign out" works even if other actions are unavailable. */
  onSignOut?: () => void
  /** Live pages: a control after the workspace title, e.g. the workspace switcher. */
  workspaceExtra?: ReactNode
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
  workspaceKind = 'learner',
  searchPlaceholder,
  helpTitle = 'Here to help you learn',
  banner,
  unavailableActions = false,
  hideUnbuilt = false,
  onSignOut,
  workspaceExtra,
  children,
  mainId = 'main-content',
}: AppShellProps) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const sidebarId = useId()
  const searchId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  // Close user profile dropdown on click outside or Escape
  useEffect(() => {
    if (!userMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [userMenuOpen])

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
    item.active ?? (pathname === item.to || (!item.exact && pathname.startsWith(`${item.to}/`)))

  return (
    <div className={styles.shell} data-drawer={drawerOpen ? 'open' : 'closed'} data-workspace={workspaceKind}>
      <a className="skip-link" href={`#${mainId}`} inert={drawerOpen}>
        Skip to content
      </a>

      <aside
        ref={sidebarRef}
        id={sidebarId}
        className={styles.sidebar}
        aria-label="Sidebar"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
      >
        <div className={styles.sidebarTop}>
          <Wordmark light={workspaceKind !== 'studio'} />
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="close" size={22} label="Close menu" />
          </button>
        </div>

        {/* Below 1024px the workspace switcher lives in the drawer, so the header keeps the identity block. */}
        {workspaceExtra ? <div className={styles.drawerSwitcher}>{workspaceExtra}</div> : null}

        <nav aria-label="Workspace">
          <ul className={styles.navList}>
            {navItems.map((item, index) => {
              const prevSection = index > 0 ? navItems[index - 1].section : null
              const isNewSection = item.section && item.section !== prevSection
              return (
                <Fragment key={item.to}>
                  {isNewSection ? (
                    <li className={styles.navSectionHeader} aria-hidden="true">
                      {item.section}
                    </li>
                  ) : null}
                  <li>
                    {item.unavailable ? (
                      <span className={`${styles.navItem} ${styles.navItemUnavailable}`} aria-disabled="true">
                        <span>{item.label}</span>
                        <span className="visually-hidden"> (not available yet)</span>
                      </span>
                    ) : (
                      <Link
                        to={item.to}
                        className={styles.navItem}
                        aria-current={isActive(item) ? 'page' : undefined}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <span>{item.label}</span>
                      </Link>
                    )}
                  </li>
                </Fragment>
              )
            })}
          </ul>
        </nav>

        {hideUnbuilt ? null : (
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
        )}

        <div className={styles.sidebarBottom}>
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
            <div className={styles.workspace} data-workspace-identity>
              {workspace.mark ? (
                <span className={styles.workspaceMark} aria-hidden="true">
                  {workspace.mark}
                </span>
              ) : null}
              <div className={styles.workspaceText}>
                <p className={styles.workspaceTitle}>{workspace.title}</p>
                {workspace.subtitle ? (
                  <p className={cx(styles.workspaceSubtitle, workspace.scope && styles.hasScope)}>{workspace.subtitle}</p>
                ) : null}
                {/* On phones the scope tag takes the subtitle's place, so it is never pushed off screen. */}
                {workspace.scope ? <p className={styles.scopeInline}>{workspace.scope}</p> : null}
              </div>
              {workspace.scope ? <span className={styles.scopeTag}>{workspace.scope}</span> : null}
            </div>
          ) : null}
          {workspaceExtra ? <div className={styles.headerSwitcher}>{workspaceExtra}</div> : null}

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
            {hideUnbuilt ? null : (
              <>
                <button type="button" className={styles.iconButton} disabled={unavailableActions}>
                  <Icon name="bell" size={22} label={unavailableActions ? 'Notifications (not available yet)' : 'Notifications'} />
                </button>
                <span className={styles.divider} aria-hidden="true" />
              </>
            )}
            <div className={styles.userMenuContainer} ref={userMenuRef}>
              <button
                type="button"
                className={styles.userMenuButton}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                <Avatar name={user.name} decorative />
                <div className={styles.userText}>
                  <p className={styles.userName}>{user.name}</p>
                  <p className={styles.userRole}>{user.roleLabel}</p>
                </div>
                <Icon
                  name="chevronDown"
                  size={16}
                  className={cx(styles.userChevron, userMenuOpen && styles.userChevronOpen)}
                />
              </button>

              {userMenuOpen ? (
                <div className={styles.userDropdown} role="menu" aria-label="User profile menu">
                  <div className={styles.dropdownHeader}>
                    <p className={styles.dropdownUserName}>{user.name}</p>
                    <p className={styles.dropdownUserRole}>{user.roleLabel}</p>
                    {user.email ? <p className={styles.dropdownUserEmail}>{user.email}</p> : null}
                  </div>
                  <div className={styles.dropdownDivider} role="separator" />
                  <Link
                    to="/profile"
                    role="menuitem"
                    className={styles.dropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Icon name="user" size={16} />
                    <span>Profile</span>
                  </Link>
                  <Link
                    to={
                      workspaceKind === 'platform'
                        ? '/admin/settings'
                        : workspaceKind === 'organization'
                          ? pathname
                          : '/profile'
                    }
                    role="menuitem"
                    className={styles.dropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Icon name="settings" size={16} />
                    <span>Settings</span>
                  </Link>
                  <Link
                    to="/help"
                    role="menuitem"
                    className={styles.dropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Icon name="help" size={16} />
                    <span>Help & Support</span>
                  </Link>
                  <div className={styles.dropdownDivider} role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className={cx(styles.dropdownItem, styles.dropdownSignOut)}
                    onClick={() => {
                      setUserMenuOpen(false)
                      onSignOut?.()
                    }}
                  >
                    <Icon name="logOut" size={16} />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : null}
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
