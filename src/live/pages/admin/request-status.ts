import type { BadgeTone } from '../../../components/ui'
import type { RequestStatus } from '../../data/onboarding'

/** Labels and badge tones for workspace request statuses (WP3). */
export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
}
