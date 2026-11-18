import { Link } from 'react-router'
import { SIGN_IN_NOTICE } from '../../content/public-site'
import authStyles from '../../pages/MockAuth.module.css'

/*
 * Footer of the live sign-in and sign-up cards (tasks 2-3 and 5-5, 15 November 2026): the sign-in
 * notice with links to the Terms of Use and the Privacy Policy, and a link to the Cookie Policy.
 *
 * The notice wording is PROVISIONAL (content/public-site.ts); the owner sets the real sentence later.
 * The design's "Want to teach? Learn about teaching." line has no destination, so the live card leaves
 * it out instead of showing text that looks like a link (the design previews keep it, marked
 * unavailable).
 */
export function LegalFooter() {
  return (
    <div className={authStyles.footer}>
      <p className={authStyles.legalNotice} data-provisional={SIGN_IN_NOTICE.provisional ? 'true' : undefined}>
        {SIGN_IN_NOTICE.beforeTerms}
        <Link to="/terms">{SIGN_IN_NOTICE.termsLabel}</Link>
        {SIGN_IN_NOTICE.afterTerms}
        <Link to="/privacy">{SIGN_IN_NOTICE.privacyLabel}</Link>
        {SIGN_IN_NOTICE.afterPrivacy}
      </p>
      <p className={authStyles.footerRow}>
        <Link to="/cookies">Cookie Policy</Link>
      </p>
    </div>
  )
}
