import type { ConfirmTone } from './ConfirmDialog'
import type { ConfirmOptions } from './useConfirm'
import styles from './ConfirmDialog.module.css'

/*
 * Handoff Assignment 2, item 2.1: one pattern for actions that change someone's access. The title
 * names the action and the object, the message says what happens and what is kept, and whether it
 * can be undone; the confirm button uses the action verb; danger tone unless it gives access back. Focus starting on Cancel and
 * Escape cancelling come from ConfirmDialog itself. Existing callers of useConfirm are unchanged.
 */
export interface HighImpactOptions {
  /** The question, naming the action and the object: "Revoke the invitation for sam@example.test?" */
  title: string
  /** What happens when confirmed. */
  happens: string
  /** What is kept, if anything. */
  kept?: string
  /** Whether it can be undone. */
  canUndo: boolean
  /** How to undo it, or what to do instead when it can't be. Without it: "This can't be undone." */
  undo?: string
  /** The action verb, with its object if that reads better: "Revoke invitation". */
  confirmLabel: string
  /** Danger by default; 'default' for actions that give access back (activate, reactivate, approve). */
  tone?: ConfirmTone
}

export function highImpact({ title, happens, kept, canUndo, undo, confirmLabel, tone = 'danger' }: HighImpactOptions): ConfirmOptions {
  return {
    title,
    confirmLabel,
    tone,
    message: (
      <div className={styles.parts}>
        <p>{happens}</p>
        {kept ? <p>{kept}</p> : null}
        <p data-undo={canUndo ? 'yes' : 'no'}>{undo ?? "This can't be undone."}</p>
      </div>
    ),
  }
}

/** Revoking an invitation (Assignments 2.4 and 3.4): the same question wherever it is asked. */
export function revokeInvitation(email: string): ConfirmOptions {
  return highImpact({
    title: `Revoke the invitation for ${email}?`,
    happens: 'The link stops working straight away, so they cannot join with it.',
    kept: 'Nobody loses access: they are not a member yet.',
    canUndo: false,
    undo: "This can't be undone, but you can send them a new invitation.",
    confirmLabel: 'Revoke invitation',
  })
}
