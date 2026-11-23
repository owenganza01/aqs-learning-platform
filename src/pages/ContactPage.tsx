import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import { CONTACT_CONTENT, LEGAL_PAGES_AVAILABLE, REQUEST_WORKSPACE_AVAILABLE } from '../content/public-site'
import styles from './PublicInfoPages.module.css'

function ContactCard({ title, value, href }: { title: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className={styles.contactCard}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.contactValue}>{href ? <a href={href}>{value}</a> : value}</p>
    </div>
  )
}

function ContactRoute({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className={styles.route}>
      <h3 className={styles.routeTitle}>{title}</h3>
      {children}
    </li>
  )
}

export default function ContactPage() {
  const { email, phone, address, replyTimes } = CONTACT_CONTENT
  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <section className={styles.intro} aria-labelledby="contact-title">
        <div className={styles.container}>
          <p className="eyebrow">Contact</p>
          <h1 className={cx('text-h1', styles.title)} id="contact-title">
            Contact AQS
          </h1>
          <p className={styles.lead}>Choose the route that fits your question.</p>
        </div>
      </section>

      <section className={styles.section} aria-label="Contact details">
        <div className={styles.container}>
          <div className={styles.contactGrid}>
            <ContactCard
              title="Email"
              value={email}
              href={email ? `mailto:${email}` : undefined}
            />
            <ContactCard
              title="Phone"
              value={phone}
              href={phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : undefined}
            />
            <ContactCard
              title="Address"
              value={address}
            />
          </div>
          {replyTimes ? (
            <p className={styles.replyTimes}>{replyTimes}</p>
          ) : null}
        </div>
      </section>

      <section className={cx(styles.section, styles.muted)} aria-labelledby="contact-routes">
        <div className={styles.container}>
          <h2 className={cx('text-h2', styles.sectionTitle)} id="contact-routes">
            Looking for something specific?
          </h2>
          <ul className={styles.routes}>
            <ContactRoute title="Training for your organization">
              {REQUEST_WORKSPACE_AVAILABLE ? (
                <p>
                  Tell us about your organization through the <Link to="/request-workspace">workspace request form</Link>.
                </p>
              ) : (
                <p>Use the contact details above to tell us about your organization.</p>
              )}
            </ContactRoute>
            <ContactRoute title="Help with an assigned course">
              <p>Your organization&apos;s admin manages your courses and invitations; contact them first.</p>
            </ContactRoute>
            {LEGAL_PAGES_AVAILABLE ? (
              <ContactRoute title="Privacy questions">
                <p>
                  See how AQS handles personal data in the <Link to="/privacy">Privacy Policy</Link>.
                </p>
              </ContactRoute>
            ) : null}
          </ul>
        </div>
      </section>
    </PublicLayout>
  )
}
