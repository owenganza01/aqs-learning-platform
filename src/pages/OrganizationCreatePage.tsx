import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Banner, Button, Card, TextField } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { samplePlatformAdminService } from '../dev/sample-platform-admin-service'
import { getPlatformAdminShell } from '../lib/navigation'
import styles from './OrganizationCreatePage.module.css'

/*
 * Platform Admin: create an organization at /admin/organizations/new (development draft, sample data).
 * Organizations start as Draft (D4). Nothing is created: the form validates locally and says so. The
 * administrator is not required at creation, because no rule requires one. A Platform Admin invites the
 * first Organization Admin afterwards (D18), and activation is reviewed separately (see the review page).
 */

const CODE_PATTERN = /^[A-Z0-9-]{3,12}$/

export default function OrganizationCreatePage() {
  const shell = getPlatformAdminShell()
  const existingCodes = samplePlatformAdminService.listOrganizations().map((o) => o.code)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const [codeError, setCodeError] = useState<string | undefined>()
  const [created, setCreated] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    const normalisedCode = code.trim().toUpperCase()
    let valid = true
    if (trimmed.length < 3 || trimmed.length > 80) {
      setNameError('Enter a name between 3 and 80 characters.')
      valid = false
    } else {
      setNameError(undefined)
    }
    if (normalisedCode !== '' && !CODE_PATTERN.test(normalisedCode)) {
      setCodeError('Use 3 to 12 letters, numbers or hyphens. Leave it empty to generate one.')
      valid = false
    } else if (existingCodes.includes(normalisedCode)) {
      setCodeError('This code is already in use.')
      valid = false
    } else {
      setCodeError(undefined)
    }
    if (!valid) return
    setCreated(trimmed)
  }

  return (
    <RoleShell
      shell={shell}
      user={previewUser('platform-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development draft with sample data. Nothing is created or saved.
        </Banner>
      }
    >
      <PageHeader title="Create organization" description="A new organization starts as a Draft. Nobody is added to it when it is created." />
      <div className={styles.layout}>
        {created ? (
          <Card padding="lg" className={styles.card}>
            <h2 className={styles.heading}>{created} is ready as a Draft</h2>
            <p>Simulated: nothing was saved. In the full product, the organization would be created as a Draft.</p>
            <p>Next: add a domain to verify it (optional), invite the first Organization Admin, then request activation review.</p>
            <div className={styles.actions}>
              <Link className={styles.link} to="/admin/organizations">
                Back to organizations
              </Link>
            </div>
          </Card>
        ) : (
          <Card padding="lg" className={styles.card}>
            <form onSubmit={submit} noValidate className={styles.form}>
              <TextField
                id="org-name"
                label="Organization name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={nameError}
              />
              <TextField
                id="org-code"
                label="Organization code"
                optional
                value={code}
                onChange={(event) => setCode(event.target.value)}
                hint="Leave empty to generate one."
                error={codeError}
              />
              <div className={styles.status}>
                <span className={styles.statusLabel}>Status</span>
                <span>Draft (set automatically)</span>
              </div>
              <div className={styles.actions}>
                <Button type="submit">Create organization</Button>
                <Link className={styles.link} to="/admin/organizations">
                  Cancel
                </Link>
              </div>
            </form>
          </Card>
        )}
        <aside className={styles.aside} aria-label="What happens next">
          <h2 className={styles.asideHeading}>Who owns it</h2>
          <p>Creation records the organization and nobody else. The Platform Admin who creates it is recorded as the creator.</p>
          <p>An Organization Admin is added when a Platform Admin invites that person. Creation does not require it.</p>
        </aside>
      </div>
    </RoleShell>
  )
}
