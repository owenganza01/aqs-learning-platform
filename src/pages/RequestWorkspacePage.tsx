import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Banner, Button, ButtonLink, Card, Select, TextArea, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import {
  checkRequest,
  EMPTY_REQUEST,
  LEARNER_RANGE_OPTIONS,
  ORGANIZATION_TYPE_OPTIONS,
  requestBody,
  splitFieldMessage,
  type FieldName,
  type SubmitWorkspaceRequest,
  type WorkspaceRequestForm,
} from '../lib/workspace-request'
import { toAppError } from '../live/api'
import styles from './RequestWorkspacePage.module.css'

/*
 * "Request a workspace" at /request-workspace (WP3, task 3-3). Layout from the Figma request-a-demo
 * frame (`Admin [Pending backend].png`, frame 3: "For organizations", "Bring AQS E-Learning to your
 * organization", one centred card), with the fields of the research and design report (10 November
 * 2026, C3) grouped under four headings. The Figma button label "Request a demo" becomes "Send
 * request", because AQS reviews a workspace request rather than booking a demo.
 *
 * Sending stores a request for AQS to review, nothing else: no account, no organization, no
 * invitation (approved WP3 plan). The organisation-request Edge Function and the database repeat
 * every check. The page states facts only; no consent or privacy wording is invented (L3 open).
 */

type Props = {
  submit: SubmitWorkspaceRequest
  /** Shown above the form: the development preview says that nothing is sent. */
  notice?: ReactNode
}

const FIELD_IDS: Record<FieldName, string> = {
  organization_name: 'req-organization-name',
  organization_type: 'req-organization-type',
  country: 'req-country',
  website: 'req-website',
  contact_name: 'req-contact-name',
  contact_email: 'req-contact-email',
  contact_role: 'req-contact-role',
  contact_phone: 'req-contact-phone',
  learner_range: 'req-learner-range',
  training_needs: 'req-training-needs',
  wants_domain_admission: 'req-domain-no',
  email_domain: 'req-email-domain',
  proposed_admin_emails: 'req-admin-1',
}

export default function RequestWorkspacePage({ submit, notice }: Props) {
  const headingId = useId()
  const [form, setForm] = useState<WorkspaceRequestForm>(EMPTY_REQUEST)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [startedAt] = useState(() => Date.now())
  const honeypot = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const set = <K extends FieldName>(field: K, value: WorkspaceRequestForm[K]) => setForm((f) => ({ ...f, [field]: value }))
  const setAdmin = (index: 0 | 1 | 2, value: string) =>
    setForm((f) => {
      const next = [...f.proposed_admin_emails] as WorkspaceRequestForm['proposed_admin_emails']
      next[index] = value
      return { ...f, proposed_admin_emails: next }
    })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setProblem(null)
    const found = checkRequest(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    setSending(true)
    try {
      const result = await submit(requestBody(form, startedAt, honeypot.current?.value ?? ''))
      setReference(result.reference)
      requestAnimationFrame(() => doneRef.current?.focus())
    } catch (caught) {
      const error = toAppError(caught)
      const { field, text } = splitFieldMessage(error.message)
      if (error.kind === 'invalid' && field) {
        setErrors({ [field]: text })
        requestAnimationFrame(() => summaryRef.current?.focus())
      } else if (error.kind === 'unavailable' || error.kind === 'network' || error.kind === 'unknown') {
        setProblem("Your request couldn't be sent right now. Please try again in a few minutes. Your answers are still here.")
      } else {
        setProblem(text)
      }
    } finally {
      setSending(false)
    }
  }

  const errorList = (Object.keys(FIELD_IDS) as FieldName[]).filter((f) => errors[f])

  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <section className={styles.page} aria-labelledby={headingId}>
        <div className={styles.container}>
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          <Card as="section" padding="lg" className={styles.card}>
            <p className={cx('eyebrow', styles.eyebrow)}>For organizations</p>
            <h1 className={cx('text-h2', styles.heading)} id={headingId}>
              Bring <span className={styles.name}>AQS E-Learning</span> to your organization
            </h1>

            {reference ? (
              <Confirmation reference={reference} headingRef={doneRef} />
            ) : (
              <>
                <p className={cx('text-body', styles.lead)}>
                  Tell us about your team and your learning goals. We&apos;ll help you find the right path forward.
                </p>
                {errorList.length > 0 ? (
                  <div className={styles.summary} role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="req-summary-title">
                    <p className={styles.summaryTitle} id="req-summary-title">
                      Please check {errorList.length === 1 ? 'one answer' : `${errorList.length} answers`}:
                    </p>
                    <ul>
                      {errorList.map((f) => (
                        <li key={f}>
                          <a href={`#${FIELD_IDS[f]}`}>{errors[f]}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {problem ? (
                  <div className={styles.notice} role="alert">
                    <Banner tone="warning">{problem}</Banner>
                  </div>
                ) : null}

                <form className={styles.form} onSubmit={onSubmit} noValidate aria-describedby="req-required-note">
                  <p className={styles.requiredNote} id="req-required-note">
                    All questions are required unless marked optional.
                  </p>

                  <Group title="Your organisation">
                    <TextField id={FIELD_IDS.organization_name} label="Organisation name" autoComplete="organization" value={form.organization_name} error={errors.organization_name} onChange={(e) => set('organization_name', e.target.value)} />
                    <div className={styles.split}>
                      <Select
                        id={FIELD_IDS.organization_type}
                        label="Type of organisation"
                        value={form.organization_type}
                        error={errors.organization_type}
                        onChange={(e) => set('organization_type', e.target.value)}
                        options={[{ value: '', label: 'Choose a type' }, ...ORGANIZATION_TYPE_OPTIONS]}
                      />
                      <TextField id={FIELD_IDS.country} label="Country" autoComplete="country-name" value={form.country} error={errors.country} onChange={(e) => set('country', e.target.value)} />
                    </div>
                    <TextField id={FIELD_IDS.website} label="Website" optional type="url" inputMode="url" placeholder="https://" autoComplete="url" value={form.website} error={errors.website} onChange={(e) => set('website', e.target.value)} />
                  </Group>

                  <Group title="About you">
                    <TextField id={FIELD_IDS.contact_name} label="Full name" autoComplete="name" value={form.contact_name} error={errors.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
                    <TextField id={FIELD_IDS.contact_email} label="Work email" type="email" autoComplete="email" placeholder="you@organization.com" hint="AQS replies to this address." value={form.contact_email} error={errors.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
                    <div className={styles.split}>
                      <TextField id={FIELD_IDS.contact_role} label="Your role" autoComplete="organization-title" placeholder="For example, Head of training" value={form.contact_role} error={errors.contact_role} onChange={(e) => set('contact_role', e.target.value)} />
                      <TextField id={FIELD_IDS.contact_phone} label="Phone" optional type="tel" autoComplete="tel" value={form.contact_phone} error={errors.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
                    </div>
                  </Group>

                  <Group title="Your training">
                    <Select
                      id={FIELD_IDS.learner_range}
                      label="Number of learners"
                      value={form.learner_range}
                      error={errors.learner_range}
                      onChange={(e) => set('learner_range', e.target.value)}
                      options={[{ value: '', label: 'Select team size' }, ...LEARNER_RANGE_OPTIONS]}
                    />
                    <TextArea id={FIELD_IDS.training_needs} label="What you want to train people on" optional rows={4} maxLength={1000} placeholder="Tell us about your learning goals and how we can help." hint="Please don't include personal details about your staff." value={form.training_needs} error={errors.training_needs} onChange={(e) => set('training_needs', e.target.value)} />
                    <fieldset className={styles.admins} aria-describedby="req-admins-hint">
                      <legend className={styles.legend}>
                        Who should manage your workspace? <span className={styles.optional}>(optional)</span>
                      </legend>
                      <p className={styles.hint} id="req-admins-hint">
                        Up to three work email addresses. AQS invites them after your request is approved; nothing is sent before then.
                      </p>
                      {([0, 1, 2] as const).map((i) => (
                        <TextField
                          key={i}
                          id={`req-admin-${i + 1}`}
                          label={`Administrator ${i + 1} email`}
                          type="email"
                          autoComplete="off"
                          value={form.proposed_admin_emails[i]}
                          error={i === 0 ? errors.proposed_admin_emails : undefined}
                          onChange={(e) => setAdmin(i, e.target.value)}
                        />
                      ))}
                    </fieldset>
                  </Group>

                  <Group title="Joining by company email">
                    <fieldset className={styles.choice} aria-describedby="req-domain-hint req-domain-error">
                      <legend className={styles.legend}>Would you like staff with your company email to join automatically later?</legend>
                      <p className={styles.hint} id="req-domain-hint">
                        This only tells AQS what you need. It switches nothing on: AQS first checks that your organisation owns the domain.
                      </p>
                      <div className={styles.radios}>
                        <label className={styles.radio}>
                          <input type="radio" name="wants-domain" id="req-domain-no" checked={form.wants_domain_admission === 'no'} onChange={() => set('wants_domain_admission', 'no')} aria-invalid={errors.wants_domain_admission ? true : undefined} />
                          No
                        </label>
                        <label className={styles.radio}>
                          <input type="radio" name="wants-domain" id="req-domain-yes" checked={form.wants_domain_admission === 'yes'} onChange={() => set('wants_domain_admission', 'yes')} aria-invalid={errors.wants_domain_admission ? true : undefined} />
                          Yes
                        </label>
                      </div>
                      {errors.wants_domain_admission ? (
                        <p className={styles.error} id="req-domain-error">
                          {errors.wants_domain_admission}
                        </p>
                      ) : null}
                    </fieldset>
                    {form.wants_domain_admission === 'yes' ? (
                      <TextField id={FIELD_IDS.email_domain} label="Your organisation's email domain" placeholder="example.org" autoComplete="off" value={form.email_domain} error={errors.email_domain} onChange={(e) => set('email_domain', e.target.value)} />
                    ) : null}
                    <p className={styles.google}>
                      Your staff will sign in with Google: a Gmail account, or a Google Workspace account on your organisation&apos;s own domain. If your organisation uses another email system, staff can still join through invitations sent to a Gmail address.
                    </p>
                  </Group>

                  {/* Honeypot: hidden from people and assistive technology; filled in only by bots. */}
                  <div className={styles.trap} aria-hidden="true">
                    <label htmlFor="req-company-fax">Leave this field empty</label>
                    <input id="req-company-fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" ref={honeypot} defaultValue="" />
                  </div>

                  <div className={styles.actions}>
                    <Button type="submit" fullWidth loading={sending}>
                      Send request
                    </Button>
                    <p className={cx('text-caption', styles.note)}>
                      AQS staff review every request. Only AQS platform administrators can see what you send. No account or workspace is created until AQS approves your request.
                    </p>
                  </div>
                </form>
              </>
            )}
          </Card>
        </div>
      </section>
    </PublicLayout>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h2 className={styles.groupTitle} id={id}>
        {title}
      </h2>
      <div className={styles.groupBody}>{children}</div>
    </section>
  )
}

function Confirmation({ reference, headingRef }: { reference: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className={styles.done}>
      <h2 className={styles.doneTitle} tabIndex={-1} ref={headingRef}>
        Request received
      </h2>
      <p className={styles.reference}>
        Your reference: <strong>{reference}</strong>
      </p>
      <p className={styles.doneLead}>Quote it if you write to AQS about your request.</p>
      <h3 className={styles.nextTitle}>What happens next</h3>
      <ol className={styles.next}>
        <li>AQS reviews your request.</li>
        <li>AQS contacts you at the work email you gave.</li>
        <li>If your request is approved, AQS sets up your workspace and invites your administrators.</li>
      </ol>
      <p className={styles.doneNote}>No workspace or account has been created yet, and there is nothing else you need to do now.</p>
      <div className={styles.doneActions}>
        <ButtonLink to="/catalog" variant="secondary">
          Browse courses
        </ButtonLink>
        <Link to="/" className={styles.homeLink}>
          Back to home
        </Link>
      </div>
    </div>
  )
}
