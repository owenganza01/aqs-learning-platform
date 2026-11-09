import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, ButtonLink, Card, EmptyState, Table, Tabs, type TableColumn } from '../../../components/ui'
import sectionStyles from '../../../pages/PlatformAdminSectionPages.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { reviewQueue, type QueueRow, type SubmissionStatus } from '../../data/video'
import { platformShell } from '../../navigation'
import { useResource } from '../../useResource'
import { SUBMISSION_STATUS } from '../teach/video-status'

/*
 * Video reviews at /admin/video-reviews (CM2-3, D39; Platform Admins). Public courses only: the
 * database never lists an organisation-only course here (video_review_queue). Not designed in
 * Figma: a proposal in the platform pages' layout, for the owner's review.
 * Filters: Submitted, In review, Approved (awaiting YouTube), and Published (for a master
 * re-attach, the narrow P5 exception).
 */

const FILTERS: Array<{ id: SubmissionStatus; label: string }> = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'in_review', label: 'In review' },
  { id: 'approved_for_publication', label: 'Approved, awaiting YouTube' },
  { id: 'published', label: 'Published' },
]

function waitingFor(since: string | null): string {
  if (!since) return '—'
  const hours = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 36e5))
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`
}

export default function LiveVideoReviews() {
  const [filter, setFilter] = useState<SubmissionStatus>('submitted')

  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Video reviews" description="Public-course videos submitted for AQS review and YouTube publication." />
      <Card padding="none" as="section" aria-label="Video submissions">
        <div className={sectionStyles.cardPad}>
          <Tabs
            label="Filter video submissions"
            value={filter}
            onChange={(id) => setFilter(id as SubmissionStatus)}
            items={FILTERS.map((f) => ({ id: f.id, label: f.label, content: <Queue key={f.id} status={f.id} /> }))}
          />
        </div>
      </Card>
    </LiveShell>
  )
}

function Queue({ status }: { status: SubmissionStatus }) {
  const rows = useResource(() => reviewQueue(status), status)
  const columns: Array<TableColumn<QueueRow>> = [
    { key: 'course', header: 'Course', render: (r) => <span className={sectionStyles.strong}>{r.courseTitle}</span> },
    { key: 'lesson', header: 'Lesson', render: (r) => `${r.lessonTitle} (version ${r.version})` },
    { key: 'owner', header: 'Owner', render: (r) => (r.ownerType === 'platform' ? 'AQS' : 'Organization') },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={SUBMISSION_STATUS[r.status].tone}>{SUBMISSION_STATUS[r.status].label}</Badge> },
    { key: 'waiting', header: 'Waiting', align: 'right', render: (r) => waitingFor(r.submittedAt) },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (r) => (
        <ButtonLink to={`/admin/video-reviews/${r.submissionId}`} variant="secondary" size="sm">
          Open<span className="visually-hidden"> {r.lessonTitle}</span>
        </ButtonLink>
      ),
    },
  ]
  return (
    <Loaded resource={rows} label="Loading video submissions">
      {(data) => (
        <div className={sectionStyles.tableWrap}>
          <Table caption="Video submissions" columns={columns} rows={data} getRowKey={(r) => r.submissionId} emptyMessage={<EmptyState title="Nothing here" description="No video submission has this status." />} />
        </div>
      )}
    </Loaded>
  )
}
