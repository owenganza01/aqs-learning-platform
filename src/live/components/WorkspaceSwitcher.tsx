import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui'
import type { Workspace } from '../session-context'
import styles from './WorkspaceSwitcher.module.css'

/**
 * Lets a person with several workspaces (organizations, roles, the platform console, their
 * own learning) move between them. Navigation only: each workspace checks access itself.
 */
export function WorkspaceSwitcher({ workspaces, currentTo }: { workspaces: Workspace[]; currentTo: string }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  if (workspaces.length < 2) return null
  const current = workspaces.find((workspace) => workspace.to === currentTo)

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        // Phase 3: the name also says which workspace is open. It starts with the visible text (WCAG 2.5.3).
        aria-label={current ? `Switch workspace, current: ${current.label}` : undefined}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Switch workspace <Icon name="chevronDown" size={16} />
      </button>
      {open ? (
        <ul id={menuId} className={styles.menu} aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <li key={workspace.to}>
              <Link
                to={workspace.to}
                className={styles.item}
                aria-current={workspace.to === currentTo ? 'true' : undefined}
                onClick={() => setOpen(false)}
              >
                <span>{workspace.label}</span>
                {workspace.to === currentTo ? <span className={styles.current}>Current</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
