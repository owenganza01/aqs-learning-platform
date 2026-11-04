import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge, Banner, Button, Card, CardHeader, Select, TextArea, TextField, useConfirm } from '../../../components/ui'
import { rpc } from '../../api'
import { ActionFeedback, Loaded } from '../../components/States'
import { authoring, slugify, type AuthoringCourse } from '../../data/authoring'
import { publicThumbnailUrl } from '../../data/learning'
import { useAction, useResource } from '../../useResource'
import styles from './CourseEditor.module.css'

/* Panels of the course page below the builder: details, staff, publication and lifecycle. */

export function DetailsPanel({ course, editable, onChanged }: { course: AuthoringCourse; editable: boolean; onChanged: () => void }) {
  const { confirm, dialog } = useConfirm()
  const [title, setTitle] = useState(course.title)
  const [summary, setSummary] = useState(course.summary)
  const [visibility, setVisibility] = useState<string>(course.visibility)
  const [policy, setPolicy] = useState<string>(course.enrollmentPolicy)
  const [saved, setSaved] = useState<string | null>(null)
  const run = useAction(async (work: () => Promise<unknown>, message: string) => {
    await work()
    setSaved(message)
    onChanged()
  })
  const thumb = publicThumbnailUrl(course.thumbnailPath)
  const platform = course.ownerType === 'platform'

  return (
    <Card as="section" padding="md" aria-label="Course details">
      {dialog}
      <CardHeader title="Course details" subtitle="What learners see before they enroll." headingLevel="h2" size="md" />
      <ActionFeedback error={run.error} success={saved} />
      <form
        className={styles.stack}
        onSubmit={async (event) => {
          event.preventDefault()
          setSaved(null)
          await run.run(
            () => authoring.updateDetails(course.id, { title: title.trim(), summary, visibility, enrollmentPolicy: policy }),
            'Details saved.',
          )
        }}
      >
        <TextField id="course-title" label="Title" value={title} disabled={!editable} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <TextArea id="course-summary" label="Summary" rows={4} value={summary} disabled={!editable} maxLength={2000} onChange={(e) => setSummary(e.target.value)} />
        <Select
          id="course-visibility"
          label="Who can find it"
          value={visibility}
          disabled={!editable || platform}
          onChange={(e) => {
            setVisibility(e.target.value)
            if (e.target.value === 'organization') setPolicy('assigned')
          }}
          options={[
            { value: 'organization', label: 'Organization members only' },
            { value: 'public', label: 'Public catalog' },
          ]}
          hint={platform ? 'Platform courses are always public.' : undefined}
        />
        <Select
          id="course-policy"
          label="How learners join"
          value={policy}
          disabled={!editable || visibility !== 'public'}
          onChange={(e) => setPolicy(e.target.value)}
          options={[
            { value: 'assigned', label: 'Assigned by an Organization Admin' },
            { value: 'open', label: 'Anyone signed in can enroll' },
          ]}
        />
        {editable ? (
          <div>
            <Button type="submit" variant="secondary" loading={run.busy}>
              Save details
            </Button>
          </div>
        ) : null}
      </form>

      <div className={styles.stack} style={{ marginTop: 24 }}>
        <h3 className="text-card-sm">Thumbnail</h3>
        {thumb ? <img src={thumb} alt="" className={styles.thumbnail} /> : null}
        <p className={styles.muted}>
          {course.thumbnailPath ? (thumb ? 'A public thumbnail is set.' : 'A private thumbnail is set (members only).') : 'No thumbnail.'}
        </p>
        {editable ? (
          <div className={styles.row}>
            <label className="visually-hidden" htmlFor="thumbnail-file">
              Choose a thumbnail image
            </label>
            <input
              id="thumbnail-file"
              className={styles.fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void run.run(() => authoring.setThumbnail(course.id, file, Boolean(course.thumbnailPath)), 'Thumbnail uploaded.')
              }}
            />
            {course.thumbnailPath ? (
              <Button
                variant="text"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: 'Remove the thumbnail?', message: 'The course shows no image until a new one is added.', confirmLabel: 'Remove thumbnail' }))
                    void run.run(() => authoring.clearThumbnail(course.id), 'Thumbnail removed.')
                }}
              >
                Remove thumbnail
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className={styles.muted}>PNG, JPEG or WebP, up to 5 MB. If you change who can find the course, add the thumbnail again.</p>
      </div>
    </Card>
  )
}

type Member = { user_id: string; full_name: string; email: string; roles: string[] }

/** Course staff (P3). Organization Admins add and remove staff; names come from P7's member list. */
export function StaffPanel({
  course,
  isOrgAdmin,
  editable,
  onChanged,
}: {
  course: AuthoringCourse
  isOrgAdmin: boolean
  editable: boolean
  onChanged: () => void
}) {
  const members = useResource(
    () => (isOrgAdmin && course.orgId ? rpc<Member[]>('organization_members', { p_org: course.orgId }) : Promise.resolve([] as Member[])),
    `${course.orgId}:${isOrgAdmin}`,
  )
  const [choice, setChoice] = useState('')
  const run = useAction(async (work: () => Promise<unknown>) => {
    await work()
    onChanged()
  })
  const staffIds = new Set(course.staff.map((s) => s.userId))

  return (
    <Card as="section" padding="md" aria-label="Course staff">
      <CardHeader title="Course staff" subtitle="People who may edit this course while it is a draft." headingLevel="h2" size="md" />
      <ActionFeedback error={run.error} />
      <Loaded resource={members} label="Loading staff">
        {(list) => {
          const names = new Map(list.map((m) => [m.user_id, m.full_name || m.email]))
          const candidates = list.filter((m) => !staffIds.has(m.user_id) && (m.roles.includes('instructor') || m.roles.includes('org_admin')))
          return (
            <div className={styles.stack}>
              <ul className={styles.stack} style={{ listStyle: 'none', padding: 0 }}>
                {course.staff.map((s) => (
                  <li key={s.userId} className={styles.rowSpread}>
                    <span>{names.get(s.userId) ?? 'Course staff member'}</span>
                    {isOrgAdmin && editable && course.staff.length > 1 ? (
                      <Button variant="text" size="sm" onClick={() => run.run(() => authoring.removeStaff(course.id, s.userId))}>
                        Remove<span className="visually-hidden"> {names.get(s.userId)}</span>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {isOrgAdmin && editable && candidates.length > 0 ? (
                <form
                  className={styles.row}
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (choice && (await run.run(() => authoring.addStaff(course.id, choice))).ok) setChoice('')
                  }}
                >
                  <Select
                    id="add-staff"
                    label="Add course staff"
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                    options={[{ value: '', label: 'Choose a person' }, ...candidates.map((m) => ({ value: m.user_id, label: m.full_name || m.email }))]}
                  />
                  <Button type="submit" size="sm" variant="neutral" disabled={!choice} loading={run.busy}>
                    Add
                  </Button>
                </form>
              ) : null}
            </div>
          )
        }}
      </Loaded>
    </Card>
  )
}

/**
 * Publication and lifecycle (L2, P1, P22, Q-07-3, P5): staff propose; another approver
 * approves or declines; previews are approved with it (P2); published courses can be cloned
 * into a new draft or archived (Q-07-10: by the owning organization's Organization Admins,
 * or Platform Admins for platform courses).
 */
export function PublicationPanel({
  course,
  userId,
  isStaff,
  canApprove,
  canArchive,
  teachBase,
  onChanged,
}: {
  course: AuthoringCourse
  userId: string
  isStaff: boolean
  canApprove: boolean
  canArchive: boolean
  teachBase: string
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [cloneTitle, setCloneTitle] = useState(`${course.title} (new version)`)
  const [message, setMessage] = useState<string | null>(null)
  const run = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    onChanged()
  })
  const clone = useAction(() => authoring.clone(course.id, cloneTitle.trim(), slugify(cloneTitle)))
  const pending = course.status === 'draft' && course.publicationRequestedAt !== null
  const proposer = course.publicationRequestedBy === userId
  // Q-08-7 (D38 #13): nobody can assign a platform course (Q-08-4), so a platform course with
  // the "assigned" policy could be published but never joined. Ask staff to open it first.
  const unjoinable = course.ownerType === 'platform' && course.enrollmentPolicy === 'assigned'
  const previewLessons = course.modules.flatMap((m) => m.lessons).filter((l) => l.previewRequested && !l.isPreview)

  return (
    <Card as="section" padding="md" aria-label="Publication">
      <CardHeader
        title="Publication"
        subtitle={
          course.status === 'published'
            ? 'Published and open to learners.'
            : course.status === 'archived'
              ? 'Archived: closed to new learners; enrolled learners keep read-only access.'
              : pending
                ? 'Waiting for approval. The course is locked until it is approved, declined or withdrawn.'
                : 'Draft: edit freely, then propose it for publication.'
        }
        headingLevel="h2"
        size="md"
      />
      <ActionFeedback error={run.error} success={message} />
      <div className={styles.stack}>
        {course.status === 'draft' && !pending && isStaff ? (
          <div>
            {unjoinable ? (
              <Banner tone="warning">
                Platform courses can't be assigned to learners, so nobody could join this course. In Course details, set "How learners join" to "Anyone signed in can enroll", save, then propose it.
              </Banner>
            ) : null}
            <Button onClick={() => run.run(() => authoring.requestPublication(course.id), 'Proposed for publication.')} loading={run.busy} disabled={unjoinable}>
              Propose for publication
            </Button>
            <p className={styles.muted}>Another approver publishes it; you can't approve your own course (P22).</p>
          </div>
        ) : null}

        {pending && isStaff ? (
          <div>
            <Button variant="neutral" onClick={() => run.run(() => authoring.withdrawPublication(course.id), 'Request withdrawn. You can edit again.')}>
              Withdraw the request
            </Button>
          </div>
        ) : null}

        {pending && canApprove && !proposer ? (
          <div className={styles.stack}>
            {previewLessons.length > 0 ? (
              <div className={styles.stack}>
                <p>Previews requested:</p>
                {previewLessons.map((lesson) => (
                  <div key={lesson.id} className={styles.rowSpread}>
                    <span>{lesson.title}</span>
                    <Button size="sm" variant="neutral" onClick={() => run.run(() => authoring.approvePreview(lesson.id), 'Preview approved.')}>
                      Approve preview<span className="visually-hidden"> {lesson.title}</span>
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.row}>
              <Button onClick={() => run.run(() => authoring.approvePublication(course.id), 'Course published.')} loading={run.busy}>
                Approve and publish
              </Button>
            </div>
            <TextField id="decline-reason" label="Reason for declining" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
            <div>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => run.run(() => authoring.declinePublication(course.id, reason.trim()), 'Request declined.')}>
                Decline
              </Button>
            </div>
          </div>
        ) : null}
        {pending && canApprove && proposer ? <Banner tone="info">You proposed this course, so another approver must decide (P22).</Banner> : null}

        {course.status !== 'draft' && (isStaff || canApprove) ? (
          <form
            className={styles.addForm}
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await clone.run()
              if (result.ok) navigate(`${teachBase}/courses/${result.value}`)
            }}
          >
            <p>Need a substantive change? Clone the course into a new draft, then publish it as a new course (P5).</p>
            <TextField id="clone-title" label="Title of the new draft" value={cloneTitle} maxLength={200} onChange={(e) => setCloneTitle(e.target.value)} />
            <ActionFeedback error={clone.error} />
            <div>
              <Button type="submit" variant="neutral" loading={clone.busy} disabled={cloneTitle.trim().length < 2}>
                Clone into a new draft
              </Button>
            </div>
          </form>
        ) : null}

        {course.status === 'published' && canArchive ? (
          <div className={styles.stack}>
            <TextField id="archive-reason" label="Reason for archiving" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
            <div>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => run.run(() => authoring.archive(course.id, reason.trim()), 'Course archived.')}>
                Archive course
              </Button>
            </div>
          </div>
        ) : null}
        {course.status === 'archived' ? <Badge>Archived</Badge> : null}
      </div>
    </Card>
  )
}

/** L5: an Organization Admin assigns a published organization course to members, with an optional due date. */
export function AssignPanel({ course }: { course: AuthoringCourse }) {
  const data = useResource(async () => {
    const [members, learners] = await Promise.all([
      rpc<Member[]>('organization_members', { p_org: course.orgId }),
      rpc<Array<{ user_id: string }>>('course_learners', { p_course: course.id }),
    ])
    const enrolled = new Set(learners.map((l) => l.user_id))
    return { candidates: members.filter((m) => !enrolled.has(m.user_id)), enrolledCount: enrolled.size }
  }, course.id)
  const [person, setPerson] = useState('')
  const [due, setDue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const assign = useAction(() => rpc('assign_course', { p_course: course.id, p_user: person, p_due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null }))

  return (
    <Card as="section" padding="md" aria-label="Assign to members">
      <CardHeader title="Assign to members" subtitle="Members you assign see the course in My courses." headingLevel="h2" size="md" />
      <ActionFeedback error={assign.error} success={message} />
      <Loaded resource={data} label="Loading members">
        {({ candidates, enrolledCount }) => (
          <form
            className={styles.stack}
            onSubmit={async (event) => {
              event.preventDefault()
              setMessage(null)
              if ((await assign.run()).ok) {
                const name = candidates.find((c) => c.user_id === person)
                setMessage(`Assigned to ${name?.full_name || name?.email}.`)
                setPerson('')
                data.reload()
              }
            }}
          >
            <p className={styles.muted}>{enrolledCount} enrolled so far.</p>
            <Select
              id="assign-person"
              label="Member"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              options={[{ value: '', label: candidates.length ? 'Choose a member' : 'Everyone is already enrolled' }, ...candidates.map((m) => ({ value: m.user_id, label: `${m.full_name || m.email} (${m.email})` }))]}
            />
            <TextField id="assign-due" label="Due date" type="date" optional value={due} onChange={(e) => setDue(e.target.value)} />
            <div>
              <Button type="submit" disabled={!person} loading={assign.busy}>
                Assign course
              </Button>
            </div>
          </form>
        )}
      </Loaded>
    </Card>
  )
}
