import { useState } from 'react'
import { Badge, Button, Card, CardHeader, Select, TextArea, TextField } from '../../../components/ui'
import { rpc } from '../../api'
import { ActionFeedback, Loaded } from '../../components/States'
import type { AuthoringCourse, AuthoringLesson } from '../../data/authoring'
import { formatDate } from '../../learner-model'
import { useAction, useResource } from '../../useResource'
import styles from './CourseEditor.module.css'

/*
 * Corrections to a published course (P4, G4): typo, formatting or broken-link fixes only,
 * with a reason and an attestation that the meaning does not change. Another person approves
 * (organization courses: an Organization Admin; platform courses: a Platform Admin). Each
 * applied correction can be reverted with the same approval. Structure, quiz settings and
 * answer keys never change (P5): clone the course instead.
 */

type Target = 'course_title' | 'course_summary' | 'module_title' | 'lesson_title' | 'lesson_body'
type Row = {
  id: string
  target: string
  target_id: string
  old_text: string
  new_text: string
  reason: string
  note: string
  status: 'pending' | 'applied' | 'declined' | 'withdrawn'
  reverts_id: string | null
  reverted_by_id: string | null
  proposed_by_name: string
  proposed_by_me: boolean
  proposed_at: string
  decided_by_name: string | null
  decline_reason: string | null
}

const TARGET_LABEL: Record<string, string> = {
  course_title: 'Course title',
  course_summary: 'Course summary',
  module_title: 'Module title',
  lesson_title: 'Lesson title',
  lesson_body: 'Lesson text',
  quiz_question_prompt: 'Quiz question',
  quiz_option_label: 'Quiz answer option',
  question_explanation: 'Answer explanation',
}
const STATUS_TONE = { pending: 'warning', applied: 'success', declined: 'neutral', withdrawn: 'neutral' } as const

export function CorrectionsPanel({
  course,
  lesson,
  canDecide,
  canPropose,
}: {
  course: AuthoringCourse
  lesson: AuthoringLesson | null
  canDecide: boolean
  canPropose: boolean
}) {
  const list = useResource(() => rpc<Row[]>('course_corrections', { p_course: course.id }), course.id)
  const moduleOf = course.modules.find((m) => m.lessons.some((l) => l.id === lesson?.id)) ?? null
  const targets: Array<{ value: Target; label: string; id: string; text: string }> = [
    { value: 'course_title', label: 'Course title', id: course.id, text: course.title },
    { value: 'course_summary', label: 'Course summary', id: course.id, text: course.summary },
    ...(moduleOf ? [{ value: 'module_title' as const, label: `Module: ${moduleOf.title}`, id: moduleOf.id, text: moduleOf.title }] : []),
    ...(lesson
      ? [
          { value: 'lesson_title' as const, label: `Lesson title: ${lesson.title}`, id: lesson.id, text: lesson.title },
          ...(lesson.type !== 'quiz' ? [{ value: 'lesson_body' as const, label: `Lesson text: ${lesson.title}`, id: lesson.id, text: lesson.body }] : []),
        ]
      : []),
  ]
  const [targetIndex, setTargetIndex] = useState(0)
  const target = targets[Math.min(targetIndex, targets.length - 1)]
  const [text, setText] = useState(target.text)
  const [reason, setReason] = useState('typo')
  const [attest, setAttest] = useState(false)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    list.reload()
  })

  return (
    <Card as="section" padding="md" aria-label="Corrections">
      <CardHeader title="Corrections" subtitle="Fix typos, formatting or broken links in the published course." headingLevel="h2" size="md" />
      <ActionFeedback error={act.error} success={message} />

      {canPropose ? (
        <form
          className={styles.addForm}
          onSubmit={async (event) => {
            event.preventDefault()
            setMessage(null)
            const done = await act.run(
              () =>
                rpc('propose_course_correction', {
                  p_target: target.value,
                  p_target_id: target.id,
                  p_new_text: text,
                  p_reason: reason,
                  p_attest: attest,
                  p_note: note,
                }),
              'Correction proposed. Another person must approve it.',
            )
            if (done.ok) {
              setAttest(false)
              setNote('')
            }
          }}
        >
          <Select
            id="correction-target"
            label="What to correct"
            value={String(targetIndex)}
            onChange={(e) => {
              const index = Number(e.target.value)
              setTargetIndex(index)
              setText(targets[index].text)
            }}
            options={targets.map((t, index) => ({ value: String(index), label: t.label }))}
          />
          <TextArea id="correction-text" label="Corrected text" rows={target.value === 'lesson_body' ? 10 : 3} value={text} onChange={(e) => setText(e.target.value)} />
          <Select
            id="correction-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={[
              { value: 'typo', label: 'Typo' },
              { value: 'formatting', label: 'Formatting' },
              { value: 'broken_link', label: 'Broken link replaced' },
            ]}
          />
          <TextField id="correction-note" label="Note (optional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <label className={styles.row}>
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
            <span>I confirm this correction does not change the meaning.</span>
          </label>
          <div>
            <Button type="submit" size="sm" disabled={!attest || text === target.text} loading={act.busy}>
              Propose correction
            </Button>
          </div>
        </form>
      ) : null}

      <Loaded resource={list} label="Loading corrections">
        {(rows) =>
          rows.length === 0 ? (
            <p className={styles.muted}>No corrections yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {rows
                .slice()
                .reverse()
                .map((row) => (
                  <li key={row.id} className={styles.correction}>
                    <div className={styles.rowSpread}>
                      <strong>
                        {row.reverts_id ? 'Revert: ' : ''}
                        {TARGET_LABEL[row.target] ?? row.target}
                      </strong>
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.reverted_by_id ? 'Reverted' : row.status[0].toUpperCase() + row.status.slice(1)}
                      </Badge>
                    </div>
                    <div className={styles.diff}>
                      <del>{row.old_text || '(empty)'}</del>
                      <ins>{row.new_text || '(empty)'}</ins>
                    </div>
                    <p className={styles.muted}>
                      {row.reason.replace('_', ' ')} · proposed by {row.proposed_by_name} on {formatDate(row.proposed_at)}
                      {row.decided_by_name && row.status !== 'withdrawn' ? ` · decided by ${row.decided_by_name}` : ''}
                      {row.decline_reason ? ` · ${row.decline_reason}` : ''}
                    </p>
                    <div className={styles.row}>
                      {row.status === 'pending' && canDecide && !row.proposed_by_me ? (
                        <>
                          <Button size="sm" onClick={() => act.run(() => rpc('decide_course_correction', { p_correction: row.id, p_approve: true }), 'Correction applied.')}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="neutral"
                            onClick={() => {
                              const why = window.prompt('Reason for declining')
                              if (why && why.trim())
                                void act.run(() => rpc('decide_course_correction', { p_correction: row.id, p_approve: false, p_reason: why.trim() }), 'Correction declined.')
                            }}
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}
                      {row.status === 'pending' && row.proposed_by_me ? (
                        <Button size="sm" variant="text" onClick={() => act.run(() => rpc('withdraw_course_correction', { p_correction: row.id }), 'Correction withdrawn.')}>
                          Withdraw
                        </Button>
                      ) : null}
                      {row.status === 'applied' && !row.reverted_by_id && canPropose ? (
                        <Button size="sm" variant="text" onClick={() => act.run(() => rpc('propose_correction_revert', { p_correction: row.id }), 'Revert proposed.')}>
                          Propose revert
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          )
        }
      </Loaded>
    </Card>
  )
}
