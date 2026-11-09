import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Banner } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import { isShellRole, previewPath, previewUser } from '../dev/role-preview'
import { NotFound } from './NotFound'

/*
 * Development-only preview of a role's shared shell at /dev/shell/:role (Batch 1).
 * It shows navigation and layout only. The page content is a labelled placeholder, because
 * the approved designs for these pages are not built yet. Not a sign-in and not role assignment.
 */
export default function RolePreviewPage() {
  const { role } = useParams()

  if (!isShellRole(role)) return <NotFound />

  const shell = getShellDefinition(role, previewPath(role))

  return (
    <RoleShell
      shell={shell}
      user={previewUser(role, shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Navigation shows the sample person and the{' '}
          {shell.roleLabel} sidebar only. It does not sign anyone in or assign a role.
        </Banner>
      }
    >
      <PageHeader
        title={`${shell.roleLabel} workspace`}
        description="Shared layout preview. This page's content is not built yet."
      />
      <section aria-label="Preview status">
        <p className="text-body">
          Sidebar entries marked as not available are shown as text, not links, because their pages do not exist yet.
        </p>
      </section>
    </RoleShell>
  )
}
