import type { BadgeTone } from '../components/ui'
import type { OrgDomain } from './data/domains'

/** 4-5/4-6: one label for a domain's state, shared by both domain views (unit-tested). */
export function domainState(d: Pick<OrgDomain, 'verifiedAt' | 'admissionEnabled' | 'admissionPaused'>): { label: string; tone: BadgeTone } {
  if (!d.verifiedAt) return { label: 'Not verified', tone: 'warning' }
  if (!d.admissionEnabled) return { label: 'Verified · admission off', tone: 'neutral' }
  if (d.admissionPaused) return { label: 'Admission paused', tone: 'warning' }
  return { label: 'Admission on', tone: 'success' }
}
