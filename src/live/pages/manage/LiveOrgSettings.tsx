import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Card, CardHeader } from '../../../components/ui'
import styles from '../../../pages/OrgAdminSettingsPage.module.css'
import { LiveShell } from '../../components/LiveShell'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'

/*
 * Organization settings at /o/:orgSlug/manage/settings (archived settings reference). The
 * first-release data model holds the organization's name, web address and status, set by a
 * Platform Admin during onboarding. The design's website, contact and branding fields are not
 * stored yet, so they are not shown as editable.
 */
const STATUS_LABEL = { draft: 'Being set up', active: 'Active', suspended: 'Suspended' } as const

export default function LiveOrgSettings() {
  const org = useCurrentOrg()
  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      <PageHeader title="Organization settings" description="Your organization's details on AQS E-Learning." />
      <div className={styles.grid}>
        <Card as="section" padding="lg" aria-label="Organization" className={styles.card}>
          <CardHeader title="Organization" headingLevel="h2" size="md" />
          <dl className={styles.fields}>
            <div>
              <dt>Name</dt>
              <dd>{org.name}</dd>
            </div>
            <div>
              <dt>Web address</dt>
              <dd>/o/{org.slug}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge tone={org.status === 'active' ? 'success' : 'neutral'}>{STATUS_LABEL[org.status]}</Badge>
              </dd>
            </div>
          </dl>
          <p className={styles.signInNote}>To change these details, contact AQS support.</p>
        </Card>
        <Card as="section" padding="lg" aria-label="Branding and contacts" className={styles.card}>
          <CardHeader title="Branding and contacts" subtitle="Coming later." headingLevel="h2" size="md" />
          <p className={styles.signInNote}>Logo, colours, website and contact people will be editable in a later release.</p>
        </Card>
      </div>
    </LiveShell>
  )
}
