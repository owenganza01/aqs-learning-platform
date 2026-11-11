/*
 * Public site content gates (landing page Concept C, approved by the owner on 10 November 2026).
 *
 * The approved design includes pages and statements whose content is not cleared for publication
 * yet. Each gate below says what must happen before it may be switched on. Switching one on is an
 * owner decision recorded in the task list; nothing here is changed to make a design look complete.
 */

/**
 * About AQS and Contact (owner decision, 10 November 2026): the pages are implemented, but their
 * public navigation links stay hidden until the owner approves the actual company text and contact
 * details. Until then the pages exist only in development builds, with clearly marked placeholders,
 * and production builds register no /about or /contact route.
 */
export const ABOUT_AND_CONTACT_APPROVED = false

/**
 * "Request a workspace" form (task 3-3): built 10 November 2026, so its links appear. It needs
 * migration 0021 and the organisation-request Edge Function on the same site (staging update
 * pack 2); until both are there the form says requests can't be sent right now.
 */
export const REQUEST_WORKSPACE_AVAILABLE = true

/** Terms of Use, Privacy Policy and Cookie Policy pages (tasks 5-1 to 5-5). */
export const LEGAL_PAGES_AVAILABLE = false

/** The /get-started page (tasks 2-1 and 2-5): built 10 November 2026; every "Get started" opens it. */
export const GET_STARTED_PAGE_AVAILABLE = true

/** Development builds show the About and Contact pages with placeholders, for design review only. */
export const SHOW_INFO_PAGE_PREVIEWS = import.meta.env.DEV && !ABOUT_AND_CONTACT_APPROVED

/*
 * Public statements reviewed in the landing page proposal (Revision 2, section 9). A statement is
 * shown only when `cleared` is true. The owner's restriction of 10 November 2026: no security,
 * privacy or product-capability claim is published before it passes its required checks.
 */
export type PublicClaimId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'

export const PUBLIC_CLAIMS: Record<PublicClaimId, { cleared: boolean; needs: string }> = {
  C1: { cleared: false, needs: 'Signed-in isolation check (PRES-4), security review (Q-7), legal check against the Privacy Policy' },
  C2: { cleared: false, needs: 'Check of the publication approval rule on the test website' },
  C3: { cleared: false, needs: 'Confirmation of the production sign-in setup' },
  C4: { cleared: true, needs: 'Owner approval of the wording (given 10 November 2026); never say that invitations are emailed' },
  C5: { cleared: false, needs: 'Organization Admin walkthrough with demo data (PRES-4, PRES-5)' },
  C6: { cleared: false, needs: 'Check of quiz marking on the test website' },
  C7: { cleared: true, needs: 'Owner approval of the wording (given 10 November 2026)' },
}

export function claimCleared(id: PublicClaimId): boolean {
  return PUBLIC_CLAIMS[id].cleared
}

/*
 * Company information for the About AQS and Contact pages. Every value is null until the owner
 * supplies approved text. A null value shows a marked placeholder in development builds and nothing
 * in production. Never put sample or dummy values here: whatever is set here is published.
 */
export const ABOUT_CONTENT: {
  /** Official name and approved ownership wording (owner decision A3 is still open). */
  ownershipLine: string | null
  introduction: string | null
  mission: string | null
  purpose: string | null
} = {
  ownershipLine: null,
  introduction: null,
  mission: null,
  purpose: null,
}

export const CONTACT_CONTENT: {
  email: string | null
  /** With country code, e.g. as AQS wants it shown. */
  phone: string | null
  address: string | null
  /** When AQS replies, only if AQS wants it published. */
  replyTimes: string | null
} = {
  email: null,
  phone: null,
  address: null,
  replyTimes: null,
}
