import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Card, CardHeader } from '../../../components/ui'
import { organizationTypeLabel } from '../../../lib/workspace-request'
import styles from '../../../pages/OrgAdminSettingsPage.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { organizationProfile } from '../../data/onboarding'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useResource } from '../../useResource'

/*
 * Organization settings at /o/:orgSlug/manage/settings (archived settings reference). The
 * first-release data model holds the organization's name, web address and status, set by a
 * Platform Admin during onboarding. WP3 (0021) adds the organisation profile (type, country, website,
 * primary contact), shown here read-only: Platform Admins keep it up to date. Branding is not stored
 * yet.
 */
const STATUS_LABEL = { draft: 'Being set up', active: 'Active', suspended: 'Suspended' } as const

export default function LiveOrgSettings() {
  const org = useCurrentOrg()
  const profile = useResource(() => organizationProfile(org.id), org.id)
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
        <Card as="section" padding="lg" aria-label="Organisation profile" className={styles.card}>
          <CardHeader title="Organisation profile" subtitle="What AQS holds about your organisation." headingLevel="h2" size="md" />
          <Loaded resource={profile} label="Loading the organisation profile">
            {(p) =>
              p ? (
                <dl className={styles.fields}>
                  <div>
                    <dt>Type</dt>
                    <dd>{organizationTypeLabel(p.organizationType)}</dd>
                  </div>
                  <div>
                    <dt>Country</dt>
                    <dd>{p.country}</dd>
                  </div>
                  <div>
                    <dt>Website</dt>
                    <dd>{p.website ?? 'Not given'}</dd>
                  </div>
                  <div>
                    <dt>Primary contact</dt>
                    <dd>
                      {p.contactName} · {p.contactEmail}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.signInNote}>AQS has not recorded a profile for your organisation yet.</p>
              )
            }
          </Loaded>
          <p className={styles.signInNote}>To change these details, contact AQS support.</p>
        </Card>
        <Card as="section" padding="lg" aria-label="Branding" className={styles.card}>
          <CardHeader title="Branding" subtitle="Coming later." headingLevel="h2" size="md" />
        </Card>
      </div>
    </LiveShell>
  )
}
