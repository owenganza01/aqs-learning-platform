import { MockAuthFooter } from '../../pages/MockAuthParts'

/*
 * Footer of the live sign-in card. The privacy policy and terms have not been supplied yet, so
 * their entries stay visibly unavailable (D24) rather than linking to invented text. Replace
 * with links once the owner provides the approved documents.
 */
export function LegalFooter() {
  return <MockAuthFooter />
}
