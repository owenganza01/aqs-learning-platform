import { useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, ButtonLink, Card, EmptyState } from '../../../components/ui'
import { certificateStatus, isIssued } from '../../certificate-model'
import { LiveShell } from '../../components/LiveShell'
import { ActionFeedback, Loaded } from '../../components/States'
import { downloadCertificate, myCertificates, type MyCertificate } from '../../data/certificates'
import { formatDate } from '../../learner-model'
import { learnerShell } from '../../navigation'
import { useAction, useResource } from '../../useResource'
import styles from '../manage/Certificates.module.css'

/*
 * The learner's certificates at /certificates, and one certificate at /certificates/:certificateId
 * (the link in the certificate_issued email: SITE_URL + /certificates/<id>, never a signed URL).
 * Own certificates only (public.my_certificates); downloads are 15-minute signed URLs from the
 * certificate-url Edge Function after the database checks the person (0026, A11).
 */
export default function LiveMyCertificates() {
  const { certificateId } = useParams()
  const data = useResource(() => myCertificates(), 'mine')
  const download = useAction((id: string) => downloadCertificate(id))

  return (
    <LiveShell shell={learnerShell()}>
      <PageHeader title="Certificates" description="Certificates you earned by completing courses." />
      <Loaded resource={data} label="Loading your certificates" loading="cards">
        {(list) => {
          if (list === null) return <Banner tone="info">Certificates are not available yet.</Banner>
          const shown = certificateId ? list.filter((c) => c.id === certificateId) : list
          if (certificateId && shown.length === 0) {
            return (
              <EmptyState
                title="We could not find that certificate"
                description="It may belong to another account. Sign in with the account you used for the course."
                action={<ButtonLink to="/certificates" variant="secondary">All certificates</ButtonLink>}
              />
            )
          }
          if (shown.length === 0) {
            return <EmptyState title="No certificates yet" description="When you complete a course whose organization issues certificates, your certificate appears here and is emailed to you." />
          }
          return (
            <>
              <ul className={styles.list} aria-label="Your certificates">
                {shown.map((c) => (
                  <CertificateItem key={c.id} c={c} busy={download.busy} onDownload={() => void download.run(c.id)} />
                ))}
              </ul>
              <ActionFeedback error={download.error} />
              {certificateId ? (
                <ButtonLink to="/certificates" variant="text">
                  All certificates
                </ButtonLink>
              ) : null}
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}

function CertificateItem({ c, onDownload, busy }: { c: MyCertificate; onDownload: () => void; busy: boolean }) {
  const status = certificateStatus(c.status)
  return (
    <li>
      <Card padding="lg">
        <div className={styles.item}>
          <div>
            <h2 className={styles.itemTitle}>{c.courseTitle}</h2>
            <p className={styles.meta}>
              {c.organizationName} · completed {formatDate(c.completedAt)}
            </p>
            <p className={styles.meta}>
              Certificate ID <span className={styles.code}>{c.code}</span>
            </p>
          </div>
          <div className={styles.actions}>
            <Badge tone={status.tone}>{status.label}</Badge>
            {isIssued(c.status) ? (
              <Button iconStart="download" loading={busy} onClick={onDownload} aria-label={`Download certificate for ${c.courseTitle}`}>
                Download
              </Button>
            ) : c.status === 'failed' ? (
              <span className={styles.muted}>Your organization has been told; ask them for help.</span>
            ) : (
              <span className={styles.muted}>We'll email you when it's ready.</span>
            )}
          </div>
        </div>
      </Card>
    </li>
  )
}
