import cookiePolicy from './cookie-policy.md?raw'
import privacyPolicy from './privacy-policy.md?raw'
import termsOfUse from './terms-of-use.md?raw'
import { parseLegalDocument, type LegalDocument } from './parse'

/*
 * The three legal documents (tasks 5-1 to 5-5; owner instruction, 15 November 2026).
 *
 * PROVISIONAL CONTENT. The owner supplied these documents on 15 November 2026 and stated that they are
 * not the final approved versions. They are shown word for word so the pages can be reviewed; nothing
 * is rewritten or corrected here. To replace a document, follow docs/legal/README.md: swap its PDF in
 * public/legal/, its text file in this folder and its reference text, then run `npm run test:unit`.
 */
export type LegalDocumentId = 'terms' | 'privacy' | 'cookies'

export type LegalEntry = {
  id: LegalDocumentId
  path: string
  /** Short name for navigation; the page heading is the document's own title. */
  label: string
  pdf: string
  document: LegalDocument
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalEntry> = {
  terms: { id: 'terms', path: '/terms', label: 'Terms of Use', pdf: '/legal/aqs-learning-terms-of-use.pdf', document: parseLegalDocument(termsOfUse) },
  privacy: { id: 'privacy', path: '/privacy', label: 'Privacy Policy', pdf: '/legal/aqs-learning-privacy-policy.pdf', document: parseLegalDocument(privacyPolicy) },
  cookies: { id: 'cookies', path: '/cookies', label: 'Cookie Policy', pdf: '/legal/aqs-learning-cookie-policy.pdf', document: parseLegalDocument(cookiePolicy) },
}

export const LEGAL_ORDER: LegalDocumentId[] = ['terms', 'privacy', 'cookies']
