import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Icon } from '../ui'
import styles from './PublicAccountMenu.module.css'

export type PublicWorkspaceLink = { label: string; to: string }

type Props = {
  name: string
  email: string
  workspaces: PublicWorkspaceLink[]
  onSignOut: () => void
}

/*
 * Account menu for signed-in people on public pages (landing page Concept C, approved 10 November
 * 2026; no Figma frame: built from the existing workspace switcher). Navigation only: every
 * workspace still checks access itself. It opens and closes with the keyboard, and Escape or a
 * click outside closes it and returns focus to its button.
 */
export function PublicAccountMenu({ name, email, workspaces, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const displayName = name || email

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={displayName} size="sm" decorative />
        <span className="visually-hidden">Account menu for {displayName}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open ? (
        <div id={menuId} className={styles.menu}>
          <div className={styles.person}>
            <span className={styles.name}>{displayName}</span>
            {name && email ? <span className={styles.email}>{email}</span> : null}
          </div>
          {workspaces.length > 0 ? (
            <>
              <p className={styles.groupLabel} id={`${menuId}-workspaces`}>
                Your workspaces
              </p>
              <ul className={styles.list} aria-labelledby={`${menuId}-workspaces`}>
                {workspaces.map((workspace) => (
                  <li key={workspace.to}>
                    <Link to={workspace.to} className={styles.item} onClick={() => setOpen(false)}>
                      {workspace.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            type="button"
            className={styles.signOut}
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
