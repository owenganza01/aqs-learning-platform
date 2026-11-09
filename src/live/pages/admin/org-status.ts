import type { BadgeTone } from '../../../components/ui'
import type { OrgStatus } from '../../session-context'

export const ORG_STATUS: Record<OrgStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
}
