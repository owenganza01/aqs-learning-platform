import { Link } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Card, CardHeader } from '../components/ui'
import { publicHeaderNav } from '../lib/public-navigation'

export default function HelpPage() {
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 'var(--space-48) var(--space-24)' }}>
        <header style={{ marginBottom: 'var(--space-32)' }}>
          <h1 style={{ fontSize: 'var(--text-h1)', margin: '0 0 var(--space-8)' }}>Help & Support</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-body-lg)', margin: 0 }}>
            Find answers to common questions about courses, accounts, workspaces, and certificates.
          </p>
        </header>

        <div style={{ display: 'grid', gap: 'var(--space-24)' }}>
          <Card padding="md">
            <CardHeader title="Getting Started as a Learner" size="sm" />
            <p style={{ color: 'var(--color-text)', margin: '0 0 var(--space-12)' }}>
              Explore available courses in our <Link to="/catalog" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>Public Catalog</Link>. Once enrolled, access all your progress and lessons directly from your <Link to="/learn" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>Learner Dashboard</Link>.
            </p>
          </Card>

          <Card padding="md">
            <CardHeader title="Organization Workspaces & Invitations" size="sm" />
            <p style={{ color: 'var(--color-text)', margin: '0 0 var(--space-12)' }}>
              If your team invited you to an organization workspace, click the invitation link received via email. For organizations seeking a dedicated training environment, you can <Link to="/request-workspace" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>request a workspace</Link>.
            </p>
          </Card>

          <Card padding="md">
            <CardHeader title="Account & Sign-In Support" size="sm" />
            <p style={{ color: 'var(--color-text)', margin: '0 0 var(--space-12)' }}>
              Sign in using your email address and password or Google authentication. If you need further assistance or need to report an issue, please reach out to our team at{' '}
              <a href="mailto:support@aqs-learning.com" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>
                support@aqs-learning.com
              </a>.
            </p>
          </Card>
        </div>
      </div>
    </PublicLayout>
  )
}
