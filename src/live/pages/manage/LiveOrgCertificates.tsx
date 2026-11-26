import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Select, Table, TextField, type TableColumn } from '../../../components/ui'
import { certificateStatus, isIssued, PAGE_SIZES, templateFileCheck } from '../../certificate-model'
import { LiveShell } from '../../components/LiveShell'
import { ActionFeedback, Loaded } from '../../components/States'
import {
  downloadCertificate,
  listTemplates,
  orgCertificates,
  templateActions,
  uploadTemplate,
  type CertificateTemplate,
  type OrgCertificate,
} from '../../data/certificates'
import { formatDate } from '../../learner-model'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useAction, useResource } from '../../useResource'
import { CertificateTemplateEditor } from './CertificateTemplateEditor'
import styles from './Certificates.module.css'

/*
 * Certificates at /o/:orgSlug/manage/certificates (0026, A11). Organization Admins upload their own
 * pre-designed template (PDF, PNG or JPEG), place the fields, preview with sample data and activate
 * it; certificates are then issued automatically when a learner completes one of the organisation's
 * courses, and emailed. The issued list shows current members only (G1, P7). The database decides
 * every permission; a refused call shows as an error.
 */

const KIND_LABEL = { pdf: 'PDF', png: 'PNG image', jpeg: 'JPEG image' } as const

export default function LiveOrgCertificates() {
  const org = useCurrentOrg()
  const templates = useResource(() => listTemplates(org.id), `t:${org.id}`)
  const issued = useResource(() => orgCertificates(org.id), `c:${org.id}`)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    templates.reload()
  })
  const download = useAction((id: string) => downloadCertificate(id))

  const unavailable = templates.state === 'ready' && templates.data === null

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      <PageHeader title="Certificates" description="Upload your certificate design. Learners get a certificate automatically, by email, when they complete one of your courses." />
      {unavailable ? (
        <Banner tone="info">Certificates are not available yet.</Banner>
      ) : (
        <div className={styles.stack}>
          <UploadCard
            orgId={org.id}
            onUploaded={(id) => {
              setMessage('Template uploaded. Place the fields, then activate it.')
              setEditing(id)
              templates.reload()
            }}
          />

          <Card as="section" padding="lg" aria-labelledby="templates-heading">
            <CardHeader title={<span id="templates-heading">Templates</span>} subtitle="One template is active at a time. Certificates already issued keep the design they were made with." headingLevel="h2" size="md" />
            <Loaded resource={templates} label="Loading templates" loading="rows">
              {(list) =>
                !list || list.length === 0 ? (
                  <EmptyState title="No template yet" description="Upload your certificate design to start issuing certificates." />
                ) : (
                  <ul className={styles.templateList}>
                    {list.map((t) => (
                      <li key={t.id} className={styles.templateItem}>
                        <div>
                          <span className={styles.templateName}>{t.name}</span>{' '}
                          {t.isActive ? <Badge tone="success">Active</Badge> : <Badge>Not active</Badge>}
                          <p className={styles.muted}>
                            {KIND_LABEL[t.kind]} · added {formatDate(t.createdAt)} · {t.issued === 1 ? '1 certificate issued' : `${t.issued} certificates issued`}
                          </p>
                        </div>
                        <div className={styles.actions}>
                          <Button variant="secondary" size="sm" onClick={() => setEditing(t.id)} aria-label={`Edit ${t.name}`}>
                            Edit
                          </Button>
                          {t.isActive ? (
                            <Button variant="neutral" size="sm" loading={act.busy} onClick={() => void act.run(() => templateActions.deactivate(t.id), `${t.name} is no longer active. New completions get no certificate.`)}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button size="sm" loading={act.busy} onClick={() => void act.run(() => templateActions.activate(t.id), `${t.name} is now active.`)}>
                              Activate
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Loaded>
            <ActionFeedback error={act.error} success={message} />
          </Card>

          {editing && templates.state === 'ready' && templates.data ? (
            <EditorFor list={templates.data} id={editing} onSaved={templates.reload} onClose={() => setEditing(null)} />
          ) : null}

          <Card as="section" padding="lg" aria-labelledby="issued-heading">
            <CardHeader title={<span id="issued-heading">Certificates issued</span>} subtitle="Certificates of your current members." headingLevel="h2" size="md" />
            <Loaded resource={issued} label="Loading certificates" loading="table">
              {(rows) => <IssuedTable rows={rows ?? []} onDownload={(id) => void download.run(id)} busy={download.busy} />}
            </Loaded>
            <ActionFeedback error={download.error} />
          </Card>
        </div>
      )}
    </LiveShell>
  )
}

function EditorFor({ list, id, onSaved, onClose }: { list: CertificateTemplate[]; id: string; onSaved: () => void; onClose: () => void }) {
  const template = list.find((t) => t.id === id)
  if (!template) return null
  return <CertificateTemplateEditor key={template.id} template={template} onSaved={onSaved} onClose={onClose} />
}

function UploadCard({ orgId, onUploaded }: { orgId: string; onUploaded: (id: string) => void }) {
  const [name, setName] = useState('')
  const [pageSize, setPageSize] = useState<string>(PAGE_SIZES[0].value)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const upload = useAction(async () => {
    if (!file) throw Object.assign(new Error('Choose a file.'), { code: '22023', message: 'AQS: Choose a PDF, PNG or JPEG file.' })
    const page = PAGE_SIZES.find((p) => p.value === pageSize) ?? PAGE_SIZES[0]
    const id = await uploadTemplate(orgId, name.trim() || file.name.replace(/\.[^.]+$/, ''), file, page)
    setFile(null)
    setName('')
    onUploaded(id)
  })
  return (
    <Card as="section" padding="lg" aria-labelledby="upload-heading">
      <CardHeader title={<span id="upload-heading">Upload a template</span>} subtitle="Your own certificate design: a PDF (first page is used), or a PNG or JPEG image. Up to 10 MB. Leave space for the fields." headingLevel="h2" size="md" />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void upload.run()
        }}
      >
        <div className={styles.formRow}>
          <TextField label="Template name" value={name} maxLength={120} optional hint="For example: Standard certificate 2026" onChange={(e) => setName(e.target.value)} />
          <Select label="Page size" hint="For PDF templates, your PDF's own page size is used." value={pageSize} onChange={(e) => setPageSize(e.target.value)} options={PAGE_SIZES.map((p) => ({ value: p.value, label: p.label }))} />
        </div>
        <label className={styles.fileLabel}>
          Template file
          <span className={styles.fileHint}>PDF, PNG or JPEG, up to 10 MB.</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            aria-invalid={fileError ? true : undefined}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null
              const check = chosen ? templateFileCheck(chosen) : null
              setFileError(check && 'error' in check ? check.error : null)
              setFile(check && !('error' in check) ? chosen : null)
            }}
          />
        </label>
        {fileError ? <Banner tone="danger">{fileError}</Banner> : null}
        <div className={styles.actions}>
          <Button type="submit" loading={upload.busy} disabled={!file}>
            Upload template
          </Button>
        </div>
        <ActionFeedback error={upload.error} />
      </form>
    </Card>
  )
}

function IssuedTable({ rows, onDownload, busy }: { rows: OrgCertificate[]; onDownload: (id: string) => void; busy: boolean }) {
  const columns: Array<TableColumn<OrgCertificate>> = [
    { key: 'name', header: 'Participant', render: (c) => c.participantName },
    { key: 'course', header: 'Course', render: (c) => c.courseTitle },
    { key: 'completed', header: 'Completed', render: (c) => formatDate(c.completedAt) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = certificateStatus(c.status === 'failed' && c.attempts < 5 ? 'pending' : c.status)
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    },
    { key: 'code', header: 'Certificate ID', render: (c) => <span className={styles.code}>{c.code}</span> },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      render: (c) =>
        isIssued(c.status) ? (
          <Button variant="text" size="sm" iconStart="download" loading={busy} onClick={() => onDownload(c.id)} aria-label={`Download the certificate of ${c.participantName} for ${c.courseTitle}`}>
            Download
          </Button>
        ) : null,
    },
  ]
  return (
    <Table
      caption="Certificates issued"
      columns={columns}
      rows={rows}
      getRowKey={(c) => c.id}
      emptyMessage="No certificates yet. They appear here when members complete a course while a template is active."
    />
  )
}

