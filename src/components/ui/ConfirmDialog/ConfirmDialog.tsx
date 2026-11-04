import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '../Button/Button'
import styles from './ConfirmDialog.module.css'

/*
 * One accessible confirmation for destructive or significant actions (CM3-1, G16), on the native
 * <dialog> element. showModal() makes the rest of the page inert (focus stays inside), Escape
 * cancels, and the browser returns focus to the control that opened it. Focus starts on Cancel,
 * the safe choice. Use it through useConfirm() rather than directly.
 */

export type ConfirmTone = 'danger' | 'default'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: ConfirmTone
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        // Escape: close through React state so the promise settles as "cancelled".
        event.preventDefault()
        onCancel()
      }}
    >
      {open ? (
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div id={messageId} className={styles.message}>
            {message}
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel} autoFocus>
              {cancelLabel}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
