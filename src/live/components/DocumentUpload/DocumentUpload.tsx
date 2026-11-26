import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button, ProgressBar } from '../../../components/ui'
import { cx } from '../../../lib/cx'
import { toAppError } from '../../api'
import { formatBytes } from '../../learner-model'
import { uploadCause } from '../upload-status'
import { addToQueue, batchSummary, DOCUMENT_ACCEPT, DOCUMENT_HINT, MAX_DOCUMENTS_PER_BATCH, type DocumentIssue, type Queued } from './document-files'
import styles from './DocumentUpload.module.css'

/*
 * A10 (brief Part 9.3): several documents in one workflow. Files are chosen with the "Choose files"
 * button (the keyboard path) or dropped on the zone, checked one by one before anything is stored
 * (document-files.ts: the existing types and limits), listed so any can be removed, then uploaded
 * one after another with their own progress. A file that fails says why and can be retried or
 * removed; the files that succeeded are kept (each upload is its own begin -> upload -> finish,
 * 0027). One polite status line announces what happened. The database still decides.
 *
 * `upload` is null on design-preview pages: nothing is sent, and `onDemo` explains that instead.
 */

const ISSUE_TEXT: Record<DocumentIssue['cause'], string> = {
  empty: 'Empty file',
  'too-large': 'Too large',
  'wrong-type': 'Wrong file type',
  name: 'Name not allowed',
}

export type UploadOne = (file: File, onProgress: (fraction: number) => void) => Promise<void>

export function DocumentUpload({
  upload,
  onUploaded,
  onDemo,
  children,
}: {
  upload: UploadOne | null
  /** Called after each file that was stored (the page reloads its document list). */
  onUploaded?: () => void
  onDemo?: () => void
  /** Controls shown above the drop zone (for example the download choice). */
  children?: ReactNode
}) {
  const hintId = useId()
  const input = useRef<HTMLInputElement>(null)
  const counter = useRef(0)
  const [queue, setQueueState] = useState<Queued<File>[]>([])
  const current = useRef(queue)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('')

  const setQueue = (next: (q: Queued<File>[]) => Queued<File>[]) => {
    current.current = next(current.current)
    setQueueState(current.current)
  }
  const patch = (key: string, state: Queued<File>['state']) => setQueue((q) => q.map((item) => (item.key === key ? { ...item, state } : item)))

  const add = (files: File[]) => {
    if (files.length === 0) return
    const result = addToQueue(current.current, files, () => `doc-${(counter.current += 1)}`)
    const before = current.current.length
    setQueue(() => result.queue)
    const added = result.queue.slice(before)
    const ready = added.filter((item) => item.state.phase === 'ready').length
    const refused = added.length - ready
    const parts = [`${ready} ${ready === 1 ? 'file' : 'files'} ready to upload.`]
    if (refused > 0) parts.push(`${refused} ${refused === 1 ? "file can't" : "files can't"} be added; see the list.`)
    if (result.leftOut > 0) parts.push(`Only ${MAX_DOCUMENTS_PER_BATCH} files can be chosen at a time, so ${result.leftOut} ${result.leftOut === 1 ? 'was' : 'were'} left out.`)
    setStatus(parts.join(' '))
  }

  /** Upload one queued file; true when it was stored. */
  const send = async (item: Queued<File>): Promise<{ ok: true } | { ok: false; text: string }> => {
    if (!upload) return { ok: false, text: '' }
    patch(item.key, { phase: 'uploading', percent: 0 })
    try {
      await upload(item.file, (fraction) => patch(item.key, { phase: 'uploading', percent: Math.round(fraction * 100) }))
      setQueue((q) => q.filter((other) => other.key !== item.key))
      onUploaded?.()
      return { ok: true }
    } catch (caught) {
      const error = toAppError(caught)
      const cause = uploadCause(error)
      patch(item.key, { phase: 'failed', cause, message: error.message })
      return { ok: false, text: `${item.file.name}: ${cause}: ${error.message}` }
    }
  }

  const run = async (items: Queued<File>[]) => {
    if (!upload) {
      onDemo?.()
      return
    }
    setBusy(true)
    setStatus(`Uploading ${items.length} ${items.length === 1 ? 'file' : 'files'}…`)
    let uploaded = 0
    const failures: string[] = []
    for (const item of items) {
      // A file removed from the list while others were uploading is skipped.
      if (!current.current.some((q) => q.key === item.key)) continue
      const result = await send(item)
      if (result.ok) uploaded += 1
      else failures.push(result.text)
    }
    setBusy(false)
    setStatus([batchSummary(uploaded, failures.length), ...failures].join(' '))
  }

  const ready = queue.filter((item) => item.state.phase === 'ready')

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    add(Array.from(event.dataTransfer.files))
  }

  return (
    <div className={styles.root}>
      {children}
      <div
        className={cx(styles.dropzone, dragging && styles.dragging)}
        data-dropzone=""
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <p className={styles.dropText}>Drag files here, or</p>
        <Button variant="secondary" size="sm" aria-describedby={hintId} onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <p id={hintId} className={styles.hint}>
          {DOCUMENT_HINT} Up to {MAX_DOCUMENTS_PER_BATCH} files at a time.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={DOCUMENT_ACCEPT}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            add(files)
          }}
        />
      </div>

      {queue.length > 0 ? (
        <ul className={styles.queue} aria-label="Files to upload">
          {queue.map((item) => (
            <li key={item.key} className={styles.item}>
              <div className={styles.itemText}>
                <span className={styles.name}>{item.file.name}</span>
                <span className={styles.meta}>
                  {item.label} · {formatBytes(item.file.size)}
                </span>
              </div>
              {item.state.phase === 'ready' ? <span className={styles.meta}>Ready to upload</span> : null}
              {item.state.phase === 'invalid' ? (
                <span className={styles.error}>
                  <strong>{ISSUE_TEXT[item.state.issue.cause]}:</strong> {item.state.issue.message}
                </span>
              ) : null}
              {item.state.phase === 'uploading' ? <ProgressBar value={item.state.percent} label={`Uploading ${item.file.name}`} /> : null}
              {item.state.phase === 'failed' ? (
                <span className={styles.error}>
                  <strong>{item.state.cause}:</strong> {item.state.message}
                </span>
              ) : null}
              {item.state.phase !== 'uploading' ? (
                <div className={styles.actions}>
                  {item.state.phase === 'failed' ? (
                    <Button variant="neutral" size="sm" needsConnection disabled={busy} onClick={() => void run([item])}>
                      Retry<span className="visually-hidden"> {item.file.name}</span>
                    </Button>
                  ) : null}
                  <Button variant="text" size="sm" onClick={() => setQueue((q) => q.filter((other) => other.key !== item.key))}>
                    Remove<span className="visually-hidden"> {item.file.name} from the list</span>
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {ready.length > 0 ? (
        <div>
          <Button needsConnection={upload !== null} loading={busy} onClick={() => void run(ready)}>
            Upload {ready.length} {ready.length === 1 ? 'file' : 'files'}
          </Button>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className={styles.status}>
        {status}
      </div>
    </div>
  )
}
