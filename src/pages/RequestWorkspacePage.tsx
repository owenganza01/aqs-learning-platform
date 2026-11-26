import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Banner, Button, ButtonLink, Card, Select, TextArea, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import { publicHeaderNav } from '../lib/public-navigation'
import {
  checkRequest,
  DOCUMENT_ACCEPT,
  EMPTY_REQUEST,
  formatFileSize,
  LEARNER_RANGE_OPTIONS,
  learnerRangeLabel,
  MAX_DOCUMENTS,
  ORGANIZATION_TYPE_OPTIONS,
  organizationTypeLabel,
  requestBody,
  splitFieldMessage,
  type FieldName,
  type SubmitResult,
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
 * invitation. The organisation-request Edge Function and the database repeat every check. The page
 * states facts only; no consent or privacy wording is invented (L3 open): the terms question links to
 * the owner's provisional Terms of Use and Privacy Policy pages.
 *
 * 23 November 2026 (WS-ONBOARD, migration 0025, brief Part 5): help text on each question, the
 * description, address, authorised representative and named administrators, supporting documents
 * (PDF, PNG or JPEG, up to five of 10 MB), the terms question, a review step before sending, and the
 * reference on the confirmation. Sending is disabled while a request is on its way; the server also
 * answers a repeat within ten minutes with the first reference instead of storing it twice.
 */

type Props = {
  submit: SubmitWorkspaceRequest
  /** Shown above the form: the development preview says that nothing is sent. */
  notice?: ReactNode
}

const FIELD_IDS: Record<FieldName, string> = {
  organization_name: 'req-organization-name',
  organization_type: 'req-organization-type',
  organization_description: 'req-organization-description',
  address: 'req-address',
  country: 'req-country',
  website: 'req-website',
  contact_name: 'req-contact-name',
  contact_email: 'req-contact-email',
  contact_role: 'req-contact-role',
  contact_phone: 'req-contact-phone',
  representative_name: 'req-representative-name',
  representative_title: 'req-representative-title',
  learner_range: 'req-learner-range',
  training_needs: 'req-training-needs',
  proposed_admins: 'req-admin-1-email',
  wants_domain_admission: 'req-domain-no',
  email_domain: 'req-email-domain',
  documents: 'req-documents',
  terms_accepted: 'req-terms',
}

type Step = 'form' | 'review'

export default function RequestWorkspacePage({ submit, notice }: Props) {
  const headingId = useId()
  const [form, setForm] = useState<WorkspaceRequestForm>(EMPTY_REQUEST)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('form')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [startedAt] = useState(() => Date.now())
  const inFlight = useRef(false)
  const honeypot = useRef<HTMLInputElement>(null)
  const honeypotValue = useRef('')
  const summaryRef = useRef<HTMLDivElement>(null)
  const reviewRef = useRef<HTMLHeadingElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const set = <K extends keyof WorkspaceRequestForm>(field: K, value: WorkspaceRequestForm[K]) => setForm((f) => ({ ...f, [field]: value }))
  const setAdmin = (index: 0 | 1 | 2, key: 'name' | 'email', value: string) =>
    setForm((f) => {
      const next = f.proposed_admins.map((a) => ({ ...a })) as WorkspaceRequestForm['proposed_admins']
      next[index][key] = value
      return { ...f, proposed_admins: next }
    })

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    setFiles((current) => [...current, ...picked].slice(0, MAX_DOCUMENTS + 1))
  }

  function showErrors(found: Partial<Record<FieldName, string>>) {
    setErrors(found)
    setStep('form')
    requestAnimationFrame(() => summaryRef.current?.focus())
  }

  function onReview(event: FormEvent) {
    event.preventDefault()
    setProblem(null)
    const found = checkRequest(form, files)
    if (Object.keys(found).length > 0) {
      showErrors(found)
      return
    }
    setErrors({})
    honeypotValue.current = honeypot.current?.value ?? ''
    setStep('review')
    requestAnimationFrame(() => reviewRef.current?.focus())
  }

  async function onSend() {
    if (inFlight.current) return // one request at a time: a double click sends once
    inFlight.current = true
    setProblem(null)
    setSending(true)
    try {
      const answer = await submit(requestBody(form, startedAt, honeypotValue.current), files)
      setResult(answer)
      requestAnimationFrame(() => doneRef.current?.focus())
    } catch (caught) {
      const error = toAppError(caught)
      const { field, text } = splitFieldMessage(error.message)
      if (error.kind === 'invalid' && field) {
        showErrors({ [field]: text })
      } else if (error.kind === 'unavailable' || error.kind === 'network' || error.kind === 'unknown') {
        setProblem("Your request couldn't be sent right now. Please try again in a few minutes. Your answers are still here.")
      } else {
        setProblem(text)
      }
    } finally {
      inFlight.current = false
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

            {result ? (
              <Confirmation result={result} email={form.contact_email.trim()} headingRef={doneRef} />
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

                {step === 'review' ? (
                  <Review form={form} files={files} headingRef={reviewRef} sending={sending} onEdit={() => setStep('form')} onSend={onSend} />
                ) : null}

                <form className={cx(styles.form, step === 'review' && styles.hidden)} onSubmit={onReview} noValidate aria-describedby="req-required-note" hidden={step === 'review'}>
                  <p className={styles.requiredNote} id="req-required-note">
                    All questions are required unless marked optional. You can check your answers before you send them.
                  </p>

                  <Group title="Your organisation">
                    <TextField id={FIELD_IDS.organization_name} label="Organisation name" hint="Its full legal or registered name." autoComplete="organization" maxLength={200} value={form.organization_name} error={errors.organization_name} onChange={(e) => set('organization_name', e.target.value)} />
                    <Select
                      id={FIELD_IDS.organization_type}
                      label="Type of organisation"
                      value={form.organization_type}
                      error={errors.organization_type}
                      onChange={(e) => set('organization_type', e.target.value)}
                      options={[{ value: '', label: 'Choose a type' }, ...ORGANIZATION_TYPE_OPTIONS]}
                    />
                    <TextArea id={FIELD_IDS.organization_description} label="About your organisation" rows={4} maxLength={1000} hint="What your organisation does and why you want an AQS workspace. 10 to 1,000 characters." value={form.organization_description} error={errors.organization_description} onChange={(e) => set('organization_description', e.target.value)} />
                    <TextArea id={FIELD_IDS.address} label="Address" rows={2} maxLength={300} autoComplete="street-address" hint="Street, building and city of your main office." value={form.address} error={errors.address} onChange={(e) => set('address', e.target.value)} />
                    <div className={styles.split}>
                      <TextField id={FIELD_IDS.country} label="Country" autoComplete="country-name" maxLength={100} value={form.country} error={errors.country} onChange={(e) => set('country', e.target.value)} />
                      <TextField id={FIELD_IDS.website} label="Website" optional type="url" inputMode="url" placeholder="https://" autoComplete="url" maxLength={300} hint="Starting with http:// or https://." value={form.website} error={errors.website} onChange={(e) => set('website', e.target.value)} />
                    </div>
                  </Group>

                  <Group title="About you">
                    <TextField id={FIELD_IDS.contact_name} label="Full name" autoComplete="name" maxLength={200} value={form.contact_name} error={errors.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
                    <TextField id={FIELD_IDS.contact_email} label="Work email" type="email" autoComplete="email" maxLength={254} placeholder="you@organization.com" hint="AQS replies to this address." value={form.contact_email} error={errors.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
                    <div className={styles.split}>
                      <TextField id={FIELD_IDS.contact_role} label="Your role" autoComplete="organization-title" maxLength={120} placeholder="For example, Head of training" value={form.contact_role} error={errors.contact_role} onChange={(e) => set('contact_role', e.target.value)} />
                      <TextField id={FIELD_IDS.contact_phone} label="Phone" optional type="tel" autoComplete="tel" maxLength={40} hint="With the country code, for example +250 788 123 456." value={form.contact_phone} error={errors.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
                    </div>
                  </Group>

                  <Group title="Authorised representative">
                    <p className={styles.hint}>The person who can agree to AQS&apos;s terms for your organisation. This can be you.</p>
                    <div className={styles.split}>
                      <TextField id={FIELD_IDS.representative_name} label="Representative's name" maxLength={200} value={form.representative_name} error={errors.representative_name} onChange={(e) => set('representative_name', e.target.value)} />
                      <TextField id={FIELD_IDS.representative_title} label="Representative's job title" maxLength={120} placeholder="For example, Director" value={form.representative_title} error={errors.representative_title} onChange={(e) => set('representative_title', e.target.value)} />
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
                      <legend className={styles.legend}>Who should manage your workspace?</legend>
                      <p className={styles.hint} id="req-admins-hint">
                        One to three people, with their work email. When AQS approves your request, your workspace is set up and each of them is invited as an Organization Admin. They join by accepting the invitation with a Google account for that address.
                      </p>
                      {errors.proposed_admins ? (
                        <p className={styles.error} id="req-admins-error">
                          {errors.proposed_admins}
                        </p>
                      ) : null}
                      {([0, 1, 2] as const).map((i) => (
                        <div className={styles.split} key={i}>
                          <TextField
                            id={`req-admin-${i + 1}-name`}
                            label={`Administrator ${i + 1} name`}
                            optional={i > 0}
                            autoComplete="off"
                            maxLength={200}
                            value={form.proposed_admins[i].name}
                            onChange={(e) => setAdmin(i, 'name', e.target.value)}
                          />
                          <TextField
                            id={`req-admin-${i + 1}-email`}
                            label={`Administrator ${i + 1} email`}
                            optional={i > 0}
                            type="email"
                            autoComplete="off"
                            maxLength={254}
                            aria-invalid={i === 0 && errors.proposed_admins ? true : undefined}
                            aria-describedby={i === 0 && errors.proposed_admins ? 'req-admins-error' : undefined}
                            value={form.proposed_admins[i].email}
                            onChange={(e) => setAdmin(i, 'email', e.target.value)}
                          />
                        </div>
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

                  <Group title="Supporting documents">
                    <div className={styles.documents}>
                      <label className={styles.legend} htmlFor={FIELD_IDS.documents}>
                        Documents <span className={styles.optional}>(optional)</span>
                      </label>
                      <p className={styles.hint} id="req-documents-hint">
                        For example a registration certificate or a letter on your organisation&apos;s letterhead. PDF, PNG or JPEG, up to {MAX_DOCUMENTS} files of 10 MB each. Only AQS platform administrators can open them.
                      </p>
                      {errors.documents ? (
                        <p className={styles.error} id="req-documents-error">
                          {errors.documents}
                        </p>
                      ) : null}
                      <input
                        id={FIELD_IDS.documents}
                        className={styles.file}
                        type="file"
                        multiple
                        accept={DOCUMENT_ACCEPT}
                        disabled={files.length >= MAX_DOCUMENTS}
                        aria-describedby={cx('req-documents-hint', errors.documents && 'req-documents-error')}
                        aria-invalid={errors.documents ? true : undefined}
                        onChange={addFiles}
                      />
                      {files.length > 0 ? (
                        <ul className={styles.fileList} aria-label="Attached documents">
                          {files.map((file, index) => (
                            <li key={`${file.name}-${index}`}>
                              <span>
                                {file.name} <span className={styles.optional}>{formatFileSize(file.size)}</span>
                              </span>
                              <Button variant="text" size="sm" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                                Remove<span className="visually-hidden"> {file.name}</span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Group>

                  <Group title="Terms">
                    <div className={styles.terms}>
                      <label className={styles.check}>
                        <input id={FIELD_IDS.terms_accepted} type="checkbox" checked={form.terms_accepted} onChange={(e) => set('terms_accepted', e.target.checked)} aria-invalid={errors.terms_accepted ? true : undefined} aria-describedby={errors.terms_accepted ? 'req-terms-error' : undefined} />
                        <span>
                          I accept the <Link to="/terms">Terms of Use</Link>, I have read the <Link to="/privacy">Privacy Policy</Link>, and I may make this request for my organisation.
                        </span>
                      </label>
                      {errors.terms_accepted ? (
                        <p className={styles.error} id="req-terms-error">
                          {errors.terms_accepted}
                        </p>
                      ) : null}
                    </div>
                  </Group>

                  {/* Honeypot: hidden from people and assistive technology; filled in only by bots. */}
                  <div className={styles.trap} aria-hidden="true">
                    <label htmlFor="req-company-fax">Leave this field empty</label>
                    <input id="req-company-fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" ref={honeypot} defaultValue="" />
                  </div>

                  <div className={styles.actions}>
                    <Button type="submit" fullWidth>
                      Review request
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

type ReviewProps = {
  form: WorkspaceRequestForm
  files: File[]
  headingRef: React.RefObject<HTMLHeadingElement | null>
  sending: boolean
  onEdit: () => void
  onSend: () => void
}

/** Brief Part 5: the applicant sees everything once more before it is sent. */
function Review({ form, files, headingRef, sending, onEdit, onSend }: ReviewProps) {
  const t = (v: string) => v.trim()
  const admins = form.proposed_admins.filter((a) => t(a.email)).map((a) => (t(a.name) ? `${t(a.name)} (${t(a.email)})` : t(a.email)))
  const rows: Array<[string, string]> = [
    ['Organisation name', t(form.organization_name)],
    ['Type of organisation', organizationTypeLabel(form.organization_type)],
    ['About your organisation', t(form.organization_description)],
    ['Address', `${t(form.address)}\n${t(form.country)}`],
    ['Website', t(form.website) || 'Not given'],
    ['Your name and role', `${t(form.contact_name)}, ${t(form.contact_role)}`],
    ['Work email', t(form.contact_email)],
    ['Phone', t(form.contact_phone) || 'Not given'],
    ['Authorised representative', `${t(form.representative_name)}, ${t(form.representative_title)}`],
    ['Number of learners', learnerRangeLabel(form.learner_range)],
    ['What you want to train people on', t(form.training_needs) || 'Not given'],
    ['Administrators', admins.join('\n')],
    ['Joining by company email', form.wants_domain_admission === 'yes' ? `Yes, ${t(form.email_domain).replace(/^@/, '').toLowerCase()}` : 'No'],
    ['Documents', files.length ? files.map((f) => `${f.name} (${formatFileSize(f.size)})`).join('\n') : 'None'],
    ['Terms', 'Accepted'],
  ]
  return (
    <section className={styles.review} aria-labelledby="req-review-title">
      <h2 className={styles.doneTitle} id="req-review-title" tabIndex={-1} ref={headingRef}>
        Check your request
      </h2>
      <p className={styles.doneLead}>Nothing has been sent yet. Edit your answers if anything is wrong.</p>
      <dl className={styles.reviewList}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.actions}>
        <Button fullWidth loading={sending} disabled={sending} onClick={onSend}>
          Send request
        </Button>
        <Button fullWidth variant="secondary" disabled={sending} onClick={onEdit}>
          Edit answers
        </Button>
      </div>
    </section>
  )
}

function Confirmation({ result, email, headingRef }: { result: SubmitResult; email: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className={styles.done}>
      <h2 className={styles.doneTitle} tabIndex={-1} ref={headingRef}>
        Request received
      </h2>
      <p className={styles.reference}>
        Your reference: <strong>{result.reference}</strong>
      </p>
      <p className={styles.doneLead}>Quote it if you write to AQS about your request. AQS uses it in every message about this request.</p>
      {result.documentsFailed ? (
        <div className={styles.notice}>
          <Banner tone="warning">
            {result.documentsFailed === 1 ? 'One document' : `${result.documentsFailed} documents`} could not be attached. Your request was received; AQS will ask you for the documents if they are needed.
          </Banner>
        </div>
      ) : null}
      <h3 className={styles.nextTitle}>What happens next</h3>
      <ol className={styles.next}>
        <li>AQS reviews your request and may ask you for more information.</li>
        <li>AQS contacts you at {email || 'the work email you gave'}.</li>
        <li>If your request is approved, your workspace is set up and the administrators you named are invited to it.</li>
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
