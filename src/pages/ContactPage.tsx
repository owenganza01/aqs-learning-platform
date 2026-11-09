import { PublicLayout } from '../components/layout/PublicLayout'
import { Badge, Banner, ButtonLink, Card } from '../components/ui'
import { publicHeaderNav } from '../lib/public-navigation'
import styles from './PublicInfoPages.module.css'

/*
 * Contact page at /contact — DEVELOPMENT ONLY (D27; authorised for the application 26 October 2026).
 *
 * No design exists for this page. AQS has not confirmed any contact details: the footer details in
 * the landing design are placeholders, and Phase 1 left them blank until AQS confirms real ones
 * ("Provisional choices made during Phase 1", item 6, in docs/decisions.md). So every detail below is a labelled placeholder, nothing is invented, and
 * there is no contact form: a form would collect personal data before the privacy review and with
 * nowhere to send it.
 */

const CONTACT_DETAILS: Array<{ label: string }> = [
  { label: 'Email' },
  { label: 'Phone' },
  { label: 'Office address' },
  { label: 'Opening hours' },
]

export default function ContactPage() {
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.intro}>
            <p className="eyebrow">Contact</p>
            <h1 className={styles.title}>Contact AQS</h1>
            <p className={styles.lead}>
              Questions about courses, or about setting up a learning environment for your organization.
            </p>
          </header>

          <Banner tone="warning">
            Development placeholder: AQS has not confirmed its contact details. No email address, phone number or
            address is shown, and there is no contact form, so nothing is sent from this page.
          </Banner>

          <div className={styles.grid}>
            <Card padding="lg" as="section" aria-labelledby="contact-details" className={styles.card}>
              <h2 id="contact-details" className={styles.heading}>
                Contact details
              </h2>
              <dl className={styles.details}>
                {CONTACT_DETAILS.map((detail) => (
                  <div key={detail.label} className={styles.detailRow}>
                    <dt>{detail.label}</dt>
                    <dd>
                      <Badge>To be confirmed by AQS</Badge>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card padding="lg" as="section" aria-labelledby="contact-organizations" className={styles.card}>
              <h2 id="contact-organizations" className={styles.heading}>
                For organizations
              </h2>
              <p>
                To request a learning environment, contact AQS. AQS collects your organization's details, approved email
                domains and nominated administrators, then sets up your environment.
              </p>
            </Card>

            <Card padding="lg" as="section" aria-labelledby="contact-learners" className={styles.card}>
              <h2 id="contact-learners" className={styles.heading}>
                For learners
              </h2>
              <p>
                If you learn through an organization, your organization administrator can help with access and
                invitations.
              </p>
              <ButtonLink to="/about" variant="text" iconEnd="arrowRight">
                About AQS E-Learning
              </ButtonLink>
            </Card>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
