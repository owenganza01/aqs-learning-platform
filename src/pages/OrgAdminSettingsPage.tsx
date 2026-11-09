import { useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Banner, Button, Card, CardHeader, TextField } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleOrgAdminService, type ContactDetails, type OrganizationSettings } from '../dev/sample-org-admin-service'
import { getOrgAdminShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './OrgAdminSettingsPage.module.css'

const SAVE_NOTICE = 'Demo only: changes were not saved. Saving will be connected to a backend later.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/*
 * Organization Admin settings at /o/:orgSlug/manage/settings (Batch: Org Admin). Development preview
 * with sample data. The design is an archived reference, not an approved one. Logo and certificate
 * uploads are not built, because no approved design or decision covers them yet.
 */
export default function OrgAdminSettingsPage() {
  const { orgSlug = '' } = useParams()
  const settings = sampleOrgAdminService.getSettings(orgSlug)

  if (!settings) return <NotFound />

  return <SettingsForm key={orgSlug} orgSlug={orgSlug} settings={settings} />
}

type SettingsFormProps = {
  orgSlug: string
  settings: OrganizationSettings
}

function SettingsForm({ orgSlug, settings }: SettingsFormProps) {
  const [organizationName, setOrganizationName] = useState(settings.organizationName)
  const [website, setWebsite] = useState(settings.website)
  const [primary, setPrimary] = useState<ContactDetails>(settings.primaryContact)
  const [privacy, setPrivacy] = useState<ContactDetails>(settings.privacyContact)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const shell = getOrgAdminShell(orgSlug)

  const primaryEmailError = attempted && !isValidEmail(primary.email) ? 'Enter an email address, such as name@example.com.' : undefined
  const privacyEmailError = attempted && !isValidEmail(privacy.email) ? 'Enter an email address, such as name@example.com.' : undefined
  const nameError = attempted && organizationName.trim() === '' ? 'Enter an organization name.' : undefined

  function handleSave() {
    setAttempted(true)
    const valid = organizationName.trim() !== '' && isValidEmail(primary.email) && isValidEmail(privacy.email)
    setNotice(valid ? SAVE_NOTICE : 'Check the highlighted fields before saving.')
  }

  return (
    <RoleShell
      shell={shell}
      user={previewUser('org-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Organization and contact details are invented.
        </Banner>
      }
    >
      <PageHeader
        title="Organization settings"
        description="Manage your organization's profile, contacts and sign-in."
        actions={
          <Button variant="primary" onClick={handleSave}>
            Save changes
          </Button>
        }
      />

      {notice ? (
        <div className={styles.notice}>
          <Banner tone={notice.startsWith('Demo only') ? 'info' : 'danger'}>{notice}</Banner>
        </div>
      ) : null}

      <div className={styles.grid}>
        <Card as="section" aria-label="Organization profile" className={styles.card}>
          <CardHeader title="Organization profile" subtitle="Your organization's identity across the learning workspace." size="md" />
          <div className={styles.fields}>
            <TextField
              id="org-name"
              label="Organization name"
              value={organizationName}
              error={nameError}
              onChange={(event) => setOrganizationName(event.target.value)}
            />
            <TextField
              id="org-website"
              label="Website"
              type="url"
              optional
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
        </Card>

        <Card as="section" aria-label="Contacts" className={styles.card}>
          <CardHeader title="Contacts" subtitle="Who we should contact about your organization." size="md" />
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Primary contact</legend>
            <TextField
              id="primary-name"
              label="Full name"
              value={primary.name}
              onChange={(event) => setPrimary({ ...primary, name: event.target.value })}
            />
            <TextField
              id="primary-email"
              label="Email address"
              type="email"
              value={primary.email}
              error={primaryEmailError}
              onChange={(event) => setPrimary({ ...primary, email: event.target.value })}
            />
          </fieldset>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Privacy contact</legend>
            <TextField
              id="privacy-name"
              label="Full name"
              value={privacy.name}
              onChange={(event) => setPrivacy({ ...privacy, name: event.target.value })}
            />
            <TextField
              id="privacy-email"
              label="Email address"
              type="email"
              value={privacy.email}
              error={privacyEmailError}
              hint="Receives data protection and privacy-related requests."
              onChange={(event) => setPrivacy({ ...privacy, email: event.target.value })}
            />
          </fieldset>
        </Card>

        <Card as="section" aria-label="Sign-in" className={styles.card}>
          <CardHeader title="Sign-in" subtitle="A secure and consistent way to access your workspace." size="md" />
          <p className={styles.signInNote}>
            Members sign in with Google. A Google-verified email address is required.
          </p>
        </Card>
      </div>
    </RoleShell>
  )
}
