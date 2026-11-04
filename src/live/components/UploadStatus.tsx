import { ProgressBar } from '../../components/ui'
import { uploadCause, type UploadState } from './upload-status'

/*
 * Inline upload status (CM3-8): what is happening to this upload, next to the control that started
 * it, with a cause-specific message when it fails (too large, wrong type, empty, network, refused,
 * already open, unreadable captions). The database still decides; this only explains.
 */

export function UploadStatus({ state, id }: { state: UploadState; id: string }) {
  if (state.phase === 'idle') return <div id={id} role="status" aria-live="polite" />
  return (
    <div id={id} role="status" aria-live="polite" style={{ display: 'grid', gap: 4 }}>
      {state.phase === 'uploading' ? (
        state.percent === undefined ? (
          <span>Uploading {state.name}…</span>
        ) : (
          <ProgressBar value={state.percent} label={`Uploading ${state.name}`} />
        )
      ) : state.phase === 'done' ? (
        <span>{state.message}</span>
      ) : (
        <span style={{ color: 'var(--color-danger)' }}>
          <strong>{uploadCause(state.error)}:</strong> {state.error.message}
        </span>
      )}
    </div>
  )
}
