import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button, Tabs } from '../../../components/ui'
import styles from './LessonSheet.module.css'
import { trapTab } from '../../../components/ui/ConfirmDialog/focus-trap'

/*
 * Mobile player sheet (CM3-4, G15; owner approval 4 November 2026). On narrow screens the lesson's
 * Overview and Documents open in a bottom sheet over the player. Only those two tabs: Notes stays
 * deferred (D7) and is not shown. Built on the native <dialog>: showModal() keeps focus inside the
 * sheet (the page behind is inert), Escape closes it, and focus returns to the button that opened
 * it. Not designed in Figma beyond the mobile frames' tab names: a proposal.
 */
export function LessonSheet({
  open,
  onClose,
  title,
  overview,
  documents,
  documentCount,
}: {
  open: boolean
  onClose: () => void
  title: string
  overview: ReactNode
  documents: ReactNode
  documentCount: number
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={headingId}
      onKeyDown={trapTab}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A tap on the backdrop (the dialog element itself, outside the panel) closes the sheet.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open ? (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
            <Button variant="text" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          <Tabs
            label="Lesson details"
            items={[
              { id: 'overview', label: 'Overview', content: overview },
              { id: 'documents', label: 'Documents', count: documentCount, content: documents },
            ]}
          />
        </div>
      ) : null}
    </dialog>
  )
}
