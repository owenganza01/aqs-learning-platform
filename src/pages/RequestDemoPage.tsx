import { useId } from 'react'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Banner, Button, Card, Select, TextArea, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import styles from './RequestDemoPage.module.css'

/*
 * Visual-only "Request a demo" form — DEVELOPMENT ONLY, registered at /request-demo under
 * import.meta.env.DEV (decision D27). Layout from the request-a-demo frame of
 * `design-reference/2 Screens/Admin [Pending backend].png` (frame 3).
 *
 * Nothing here is sent or saved. The submit control is disabled and labelled "not available
 * yet". The form makes no network request, writes nothing to storage, creates no organization
 * and grants no access. No navigation entry point links here (no entry point is approved).
 */

const SUBMISSION_NOTE = 'Submitting this form is not available yet. Nothing you type here is sent or saved.'

// The only option is the design's placeholder. Real team-size ranges are not decided.
const TEAM_SIZE_OPTIONS = [{ value: '', label: 'Select team size' }]

export default function RequestDemoPage() {
  const noticeId = useId()
  const headingId = useId()

  return (
    <PublicLayout>
      <section className={styles.page} aria-labelledby={headingId}>
        <div className={styles.container}>
          <div className={styles.notice}>
            <Banner tone="info">
              <span id={noticeId}>{SUBMISSION_NOTE}</span>
            </Banner>
          </div>

          <Card as="section" padding="lg" className={styles.card}>
            <p className={cx('eyebrow', styles.eyebrow)}>For organizations</p>
            <h1 className={cx('text-h2', styles.heading)} id={headingId}>
              Bring AQS E-Learning to your organization
            </h1>
            <p className={cx('text-body', styles.lead)}>
              Tell us about your team and your learning goals. We&apos;ll help you find the right path forward.
            </p>

            {/* No action and no submit handler: the form cannot send anything. */}
            <form className={styles.form} onSubmit={(event) => event.preventDefault()} noValidate>
              <div className={styles.row}>
                <TextField label="Full name" name="fullName" autoComplete="off" placeholder="Enter your full name" />
              </div>
              <div className={styles.row}>
                <TextField label="Work email" name="workEmail" type="email" autoComplete="off" placeholder="you@organization.com" />
              </div>
              <div className={styles.split}>
                <TextField label="Organization" name="organization" autoComplete="off" placeholder="Organization name" />
                <Select label="Number of learners" name="learners" options={TEAM_SIZE_OPTIONS} defaultValue="" />
              </div>
              <div className={styles.row}>
                <TextArea
                  label="Message"
                  name="message"
                  rows={4}
                  placeholder="Tell us about your learning goals and how we can help."
                />
              </div>

              <div className={styles.actions}>
                <Button type="submit" fullWidth disabled aria-describedby={noticeId}>
                  Request a demo
                  <span className="visually-hidden"> (not available yet)</span>
                </Button>
                <p className={cx('text-caption', styles.note)}>
                  Our team will get in touch to set up your organization. Submitting is not available yet.
                </p>
              </div>
            </form>
          </Card>
        </div>
      </section>
    </PublicLayout>
  )
}
