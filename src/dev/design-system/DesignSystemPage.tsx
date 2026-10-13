/*
 * /design-system — DEVELOPMENT-ONLY preview of the AQS design foundations.
 *
 * Compare this page against:
 *   design-reference/1 Cover & Foundations/Design system.png
 *
 * Everything here uses MOCK content. It is not a product page and is excluded
 * from production builds (see src/App.tsx).
 */
import type { MouseEvent, ReactNode } from 'react'
import { AppShell, AuthLayout, FocusLayout, PublicLayout, type NavItem } from '../../components/layout'
import {
  Avatar,
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  Table,
  Tabs,
  TextArea,
  TextField,
  type TableColumn,
} from '../../components/ui'
import { contrastRatio } from './contrast'
import styles from './DesignSystemPage.module.css'

/* ------------------------------------------------------------------ */
/* Data for the token sections (values mirror src/styles/tokens.css)   */
/* ------------------------------------------------------------------ */

type Swatch = { name: string; token: string; hex: string; role: string; textUse: boolean }

const colourGroups: Array<{ title: string; note: string; swatches: Swatch[] }> = [
  {
    title: 'Brand palette',
    note: 'Verified against the design system page by pixel sampling.',
    swatches: [
      { name: 'Navy', token: '--color-navy', hex: '#1E3A5F', role: 'Brand foundation, sidebar', textUse: true },
      { name: 'Blue', token: '--color-blue', hex: '#2563EB', role: 'Links & selection', textUse: true },
      { name: 'Orange accent', token: '--color-orange', hex: '#F97316', role: 'Decorative accent only (D1)', textUse: false },
      { name: 'Background', token: '--color-canvas', hex: '#F8FAFC', role: 'Canvas', textUse: false },
      { name: 'Text', token: '--color-text', hex: '#0F172A', role: 'Primary content', textUse: true },
      { name: 'White', token: '--color-white', hex: '#FFFFFF', role: 'Surface', textUse: false },
    ],
  },
  {
    title: 'Accessible action colours (D1)',
    note: 'Primary buttons use #C2410C so white labels meet WCAG AA. #F97316 stays as a brand accent.',
    swatches: [
      { name: 'Action', token: '--color-action', hex: '#C2410C', role: 'Primary button fill', textUse: true },
      { name: 'Action hover', token: '--color-action-hover', hex: '#9A3412', role: 'Primary button hover', textUse: true },
      { name: 'Accent text', token: '--color-accent-text', hex: '#C2410C', role: 'Orange eyebrows & labels', textUse: true },
      { name: 'Sidebar active', token: '--color-navy-light', hex: '#2C4D75', role: 'Active nav item, help card', textUse: false },
    ],
  },
  {
    title: 'Neutrals',
    note: 'Secondary text must not be lighter than #64748B.',
    swatches: [
      { name: 'Text muted', token: '--color-text-muted', hex: '#64748B', role: 'Descriptions, captions', textUse: true },
      { name: 'Text subtle', token: '--color-text-subtle', hex: '#475569', role: 'Labels, table headers', textUse: true },
      { name: 'Input border', token: '--color-input-border', hex: '#8391A7', role: 'Form controls (3:1 rule)', textUse: false },
      { name: 'Border', token: '--color-border', hex: '#E2E8F0', role: 'Card & table borders', textUse: false },
      { name: 'Border strong', token: '--color-border-strong', hex: '#CBD5E1', role: 'Outline buttons, disabled fill', textUse: false },
      { name: 'Surface muted', token: '--color-surface-muted', hex: '#F1F5F9', role: 'Skeletons, frames', textUse: false },
    ],
  },
  {
    title: 'Status colours',
    note: 'Used in screens but not on the design system page. Added as tokens; each text colour passes AA on its tint.',
    swatches: [
      { name: 'Success', token: '--color-success', hex: '#15803D', role: 'Completed, Verified', textUse: true },
      { name: 'Warning', token: '--color-warning', hex: '#9A3412', role: 'Offline, Overdue (on #FFF7ED)', textUse: true },
      { name: 'Danger', token: '--color-danger', hex: '#B91C1C', role: 'Revoke, Deactivate, errors', textUse: true },
      { name: 'Violet', token: '--color-violet', hex: '#6D28D9', role: 'General Admin badge', textUse: true },
    ],
  },
]

// "measured" = size read from the 1440px design exports (±1.5px). See tokens.css.
const typeScale = [
  { name: 'Display', className: 'text-h1', spec: '56 / 60 · 700', measured: '56–58', use: 'Landing hero only', sample: 'Build the skills that move you forward' },
  { name: 'Heading', className: 'text-h2', spec: '40 / 46 · 700', measured: '40–42', use: 'Landing sections, sign-in heading', sample: 'A simple path from sign-in to certificate' },
  { name: 'Page title', className: 'text-title', spec: '32 / 40 · 700', measured: '32–34', use: 'Dashboard & admin page titles', sample: 'Welcome back, Owen' },
  { name: 'Section title', className: 'text-section', spec: '28 / 36 · 700', measured: '≈29', use: 'Course builder, lesson title, quiz question', sample: 'Fitting a regression line' },
  { name: 'Card title L', className: 'text-h3', spec: '24 / 31 · 600', measured: '24–25', use: 'Dashboard cards, empty states', sample: 'Continue learning' },
  { name: 'Card title M', className: 'text-card-md', spec: '20 / 28 · 600', measured: '20–21', use: 'Landing cards, player & quiz header', sample: 'Strategic leadership' },
  { name: 'Panel title', className: 'text-card-sm', spec: '18 / 26 · 600', measured: '18', use: 'Panels, list course titles', sample: 'Documents and attachments' },
  { name: 'Lead', className: 'text-lead', spec: '18 / 28 · 400', measured: '18', use: 'Hero & section intros', sample: 'Practical courses, expert instruction, and flexible pathways.' },
  { name: 'Body', className: 'text-body', spec: '16 / 25 · 400', measured: '16', use: 'Page subtitles, quiz options', sample: 'A little progress, every day.' },
  { name: 'Body small', className: 'text-body-sm', spec: '15 / 22 · 400', measured: '15', use: 'Form text, tabs, card descriptions', sample: 'Build a clear direction, align teams, and make decisions.' },
  { name: 'Caption', className: 'text-caption', spec: '14 / 20 · 500', measured: '14', use: 'Labels, table cells', sample: 'Courses in progress' },
  { name: 'Hint', className: 'text-hint', spec: '12 / 16 · 400', measured: '11–12', use: 'Helper text, subtitles under names', sample: 'Separate multiple addresses with commas.' },
  { name: 'Eyebrow', className: 'eyebrow', spec: '12 / 16 · 600 · caps', measured: '12', use: 'Labels above headings', sample: 'Featured courses' },
]

const spacing = [
  { step: '1×', px: 8 },
  { step: '2×', px: 16 },
  { step: '3×', px: 24 },
  { step: '4×', px: 32 },
  { step: '6×', px: 48 },
  { step: '8×', px: 64 },
]

/* ------------------------------------------------------------------ */
/* Mock data — clearly fictional sample content                        */
/* ------------------------------------------------------------------ */

type MockOrg = { id: string; name: string; domain: string; learners: number; status: 'Active' | 'Draft' | 'Suspended' }

const mockOrgs: MockOrg[] = [
  { id: 'ORG-001', name: 'ABC Corporation', domain: 'abc.example', learners: 428, status: 'Active' },
  { id: 'ORG-002', name: 'Meridian Technologies', domain: 'meridian.example', learners: 816, status: 'Active' },
  { id: 'ORG-006', name: 'Willow Learning', domain: 'willow.example', learners: 0, status: 'Draft' },
  { id: 'ORG-004', name: 'Summit Financial', domain: 'summit.example', learners: 284, status: 'Suspended' },
]

const statusTone = { Active: 'success', Draft: 'neutral', Suspended: 'warning' } as const

const orgColumns: Array<TableColumn<MockOrg>> = [
  {
    key: 'name',
    header: 'Organization',
    render: (org) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontWeight: 600 }}>
        <Avatar name={org.name} size="sm" decorative />
        {org.name}
      </span>
    ),
  },
  { key: 'domain', header: 'Email domain', render: (org) => org.domain },
  { key: 'id', header: 'Organization ID', render: (org) => org.id },
  { key: 'learners', header: 'Learners', align: 'right', render: (org) => org.learners.toLocaleString() },
  { key: 'status', header: 'Status', render: (org) => <Badge tone={statusTone[org.status]}>{org.status}</Badge> },
  {
    key: 'action',
    header: 'Action',
    hideHeader: true,
    align: 'right',
    render: (org) => (
      <Button variant="secondary" size="sm" aria-label={`View ${org.name}`}>
        View
      </Button>
    ),
  },
]

const learnerNav: NavItem[] = [
  { label: 'Dashboard', to: '/mock/dashboard', active: true },
  { label: 'My courses', to: '/mock/my-courses' },
  { label: 'Catalog', to: '/mock/catalog' },
  { label: 'Certificates', to: '/mock/certificates' },
  { label: 'Messages', to: '/mock/messages' },
  { label: 'Profile', to: '/mock/profile' },
]

const mockUser = { name: 'Sample Learner', roleLabel: 'Learner' }

const sections = [
  { id: 'colour', label: 'Colour' },
  { id: 'typography', label: 'Typography' },
  { id: 'in-context', label: 'Type in context' },
  { id: 'spacing', label: 'Spacing, radius & elevation' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Form fields' },
  { id: 'cards', label: 'Cards & stats' },
  { id: 'badges', label: 'Badges & avatars' },
  { id: 'progress', label: 'Progress & loading' },
  { id: 'feedback', label: 'Empty states & banners' },
  { id: 'table', label: 'Table' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'layouts', label: 'Layouts' },
]

/* ------------------------------------------------------------------ */
/* Small helpers for this page                                         */
/* ------------------------------------------------------------------ */

function Section({ id, title, note, children }: {
  id: string
  title: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`} className="text-card-md">
          {title}
        </h2>
        {note ? <p className={`${styles.sectionNote} text-body-sm`}>{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function ContrastBadge({ hex }: { hex: string }) {
  const ratio = contrastRatio(hex, '#FFFFFF')
  const tone = ratio >= 4.5 ? 'success' : ratio >= 3 ? 'warning' : 'danger'
  const verdict = ratio >= 4.5 ? 'AA text' : ratio >= 3 ? 'Large text / UI only' : 'Decorative only'
  return (
    <Badge tone={tone}>
      {ratio.toFixed(2)}:1 · {verdict}
    </Badge>
  )
}

/** Stops links inside the sample layouts from leaving the preview page. */
function stopNavigation(event: MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest('a')) event.preventDefault()
}

function Frame({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <div className={styles.frameLabel}>
        <span>{label}</span>
        <Badge tone="neutral">{note}</Badge>
      </div>
      <div className={styles.frameViewport} onClickCapture={stopNavigation}>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DesignSystemPage() {
  return (
    <div className={styles.page}>
      <header className={`${styles.topBar} on-dark`}>
        <p className={styles.topTitle}>AQS design system preview</p>
        <span className={styles.devTag}>Development only</span>
      </header>

      <div className={styles.body}>
        <nav className={styles.toc} aria-label="Design system sections">
          <ul className={styles.tocList}>
            {sections.map((section) => (
              <li key={section.id}>
                <a className={styles.tocLink} href={`#${section.id}`}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.content}>
          <Banner tone="info">
            This page is a development tool for checking the Phase 1 foundations against{' '}
            <strong>design-reference/1 Cover &amp; Foundations/Design system.png</strong>. It uses mock content
            and is not included in production builds.
          </Banner>

          {/* 01 Colour */}
          <Section
            id="colour"
            title="Colour system"
            note="Navy builds trust, blue supports navigation, and orange marks emphasis and the primary action. Ratios are calculated against white."
          >
            {colourGroups.map((group) => (
              <div key={group.title} className={styles.stack}>
                <div>
                  <h3 className={styles.subheading}>{group.title}</h3>
                  <p className="text-caption text-muted">{group.note}</p>
                </div>
                <div className={styles.swatchGrid}>
                  {group.swatches.map((swatch) => (
                    <div key={swatch.token} className={styles.swatch}>
                      <div className={styles.swatchColor} style={{ background: `var(${swatch.token})` }} />
                      <div className={styles.swatchInfo}>
                        <span className={styles.swatchName}>{swatch.name}</span>
                        <span className={styles.mono}>
                          {swatch.hex} · {swatch.token}
                        </span>
                        <span className="text-muted">{swatch.role}</span>
                        {swatch.textUse || swatch.hex === '#F97316' ? (
                          <div className={styles.swatchRow}>
                            <ContrastBadge hex={swatch.hex} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          {/* 02 Typography */}
          <Section
            id="typography"
            title="Inter type scale"
            note="One typeface keeps instructional content crisp and predictable across product and marketing surfaces."
          >
            <Card padding="lg">
              {typeScale.map((type) => (
                <div key={type.name} className={styles.typeRow}>
                  <p className={styles.typeMeta}>
                    <strong>{type.name}</strong>
                    <span className={styles.mono}>.{type.className}</span>
                    {type.spec}
                    <br />
                    Measured in designs: {type.measured}px
                    <br />
                    {type.use}
                  </p>
                  <p className={type.className}>{type.sample}</p>
                </div>
              ))}
            </Card>
          </Section>

          {/* Type in context: compositions rebuilt from specific design screens */}
          <Section
            id="in-context"
            title="Type in context"
            note="Small compositions rebuilt from specific design screens, so sizes can be compared side by side with the PNGs at 100% zoom. Mock content."
          >
            <div className={styles.contextGrid}>
              <Card padding="lg">
                <p className={styles.contextSource}>Learner dashboard [Ready] · frame 1</p>
                <h3 className="text-title">Welcome back, Owen</h3>
                <p className="text-body text-muted" style={{ marginTop: 8 }}>
                  A little progress, every day. Pick up where you left off.
                </p>
                <div className={styles.contextInner}>
                  <p className="text-h3">Continue learning</p>
                  <p className="eyebrow" style={{ color: 'var(--color-blue)', marginTop: 16 }}>
                    Data &amp; analytics
                  </p>
                  <p className="text-h3" style={{ marginTop: 4 }}>
                    Data analytics fundamentals
                  </p>
                  <p className="text-body text-muted" style={{ marginTop: 8 }}>
                    Next: Lesson 4 · Introduction to regression
                  </p>
                </div>
              </Card>

              <Card padding="lg">
                <p className={styles.contextSource}>Landing [Ready] · featured courses</p>
                <p className="eyebrow">Featured courses</p>
                <h3 className="text-h2" style={{ marginTop: 8 }}>
                  Start with the courses teams are learning now.
                </h3>
                <p className="text-lead text-muted" style={{ marginTop: 12 }}>
                  From leadership to operations, every course is designed to be practical.
                </p>
                <div className={styles.contextInner}>
                  <p className="text-card-md">Strategic leadership</p>
                  <p className="text-body-sm text-muted" style={{ marginTop: 8 }}>
                    Build a clear direction, align teams, and make decisions that drive long-term impact.
                  </p>
                  <div className={styles.row} style={{ marginTop: 12 }}>
                    <Badge tone="info">Intermediate</Badge>
                    <span className="text-caption text-muted">Instructor: Sample Name</span>
                  </div>
                </div>
              </Card>

              <Card padding="lg">
                <p className={styles.contextSource}>Learner courses &amp; quizzes · frame 2</p>
                <p className="eyebrow" style={{ color: 'var(--color-blue)' }}>
                  Check your understanding
                </p>
                <h3 className="text-section" style={{ marginTop: 12 }}>
                  In a simple linear regression model, what does a slope of 2.5 mean?
                </h3>
                <p className="text-caption text-muted" style={{ marginTop: 12 }}>
                  Select one answer.
                </p>
                <div className={styles.contextInner}>
                  <p className="text-body">For each one-unit increase in x, the predicted value of y increases by 2.5.</p>
                </div>
              </Card>

              <Card padding="lg">
                <p className={styles.contextSource}>Instructor [Pending backend] · course builder</p>
                <h3 className="text-section">Course builder</h3>
                <div className={styles.contextInner}>
                  <CardHeader title="Modules" subtitle="Drag to reorder modules and lessons." size="sm" headingLevel="h3" />
                  <TextField label="Lesson title" defaultValue="Welcome to the team" hint="Shown to learners in the course outline." />
                </div>
              </Card>
            </div>
          </Section>

          {/* 03 Spacing, radius, elevation */}
          <Section
            id="spacing"
            title="System specifications"
            note="A shared 8px rhythm, 12px radius, and two elevation levels."
          >
            <div className={styles.twoCol}>
              <Card padding="lg">
                <CardHeader title="8px spacing grid" subtitle="Use multiples of the base unit." headingLevel="h3" />
                <div className={styles.stack}>
                  {spacing.map((space) => (
                    <div key={space.px} className={styles.spaceRow}>
                      <span className={styles.mono}>
                        {space.step} --space-{space.px}
                      </span>
                      <span className={styles.spaceBar} style={{ width: `${(space.px / 64) * 100}%` }} />
                      <span className="text-muted">{space.px}px</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card padding="lg">
                <CardHeader title="12px corner radius" subtitle="Cards, buttons, inputs and content panels." headingLevel="h3" />
                <div className={styles.radiusDemo}>
                  <Button size="sm">12px radius</Button>
                </div>
              </Card>
            </div>
            <div className={styles.twoCol}>
              <Card padding="lg" className={styles.elevationCard}>
                <Badge tone="info">Shadow 01</Badge>
                <div>
                  <p className={styles.subheading}>Cards and controls</p>
                  <p className={`${styles.mono} text-muted`}>0 2px 8px 0 · navy at 8%</p>
                </div>
              </Card>
              <Card padding="lg" elevated={false} className={styles.elevationCard} style={{ boxShadow: 'var(--shadow-2)' }}>
                <Badge tone="warning">Shadow 02</Badge>
                <div>
                  <p className={styles.subheading}>Menus and dialogs</p>
                  <p className={`${styles.mono} text-muted`}>0 12px 32px -4px · navy at 15%</p>
                </div>
              </Card>
            </div>
          </Section>

          {/* 04 Buttons */}
          <Section
            id="buttons"
            title="Button system"
            note="48px height and 12px radius. Orange is reserved for the clearest next step — one per view. Press Tab to see real keyboard focus."
          >
            <Card padding="lg">
              <div className={styles.stateGrid}>
                <span className={styles.stateHead}>Variant</span>
                <span className={styles.stateHead}>Default</span>
                <span className={styles.stateHead}>Hover</span>
                <span className={styles.stateHead}>Focus</span>
                <span className={styles.stateHead}>Disabled</span>
                {(
                  [
                    ['primary', 'Primary', 'One dominant action per view', 'Start learning'],
                    ['secondary', 'Secondary', 'Alternative or reversible action', 'Save progress'],
                    ['neutral', 'Neutral (added)', 'Grey outline used by Previous / Cancel', 'Previous'],
                    ['text', 'Text', 'Low-emphasis navigation', 'View lesson'],
                    ['danger', 'Danger (added)', 'Destructive actions', 'Revoke'],
                  ] as const
                ).map(([variant, name, note, label]) => (
                  <div key={variant} style={{ display: 'contents' }}>
                    <div>
                      <p className={styles.variantName}>{name}</p>
                      <p className={styles.variantNote}>{note}</p>
                    </div>
                    <Button variant={variant} iconEnd={variant === 'text' ? 'arrowRight' : undefined}>
                      {label}
                    </Button>
                    <Button variant={variant} data-preview-state="hover" tabIndex={-1} iconEnd={variant === 'text' ? 'arrowRight' : undefined}>
                      {label}
                    </Button>
                    <Button variant={variant} data-preview-state="focus" tabIndex={-1} iconEnd={variant === 'text' ? 'arrowRight' : undefined}>
                      {label}
                    </Button>
                    <Button variant={variant} disabled iconEnd={variant === 'text' ? 'arrowRight' : undefined}>
                      {label}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
            <div className={styles.row}>
              <Button iconEnd="arrowRight">Continue</Button>
              <Button variant="secondary" iconStart="plus">
                Add module
              </Button>
              <Button loading>Saving</Button>
              <Button size="sm" variant="secondary">
                Small (36px)
              </Button>
              <ButtonLink to="/design-system" variant="neutral">
                Link styled as button
              </ButtonLink>
            </div>
            <Banner tone="info">
              Hover and focus columns are forced for comparison only. The design system page shows an identical
              colour for primary default and hover; a darker hover (#9A3412) was added so the state is visible.
            </Banner>
          </Section>

          {/* 05 Forms */}
          <Section
            id="forms"
            title="Form fields"
            note="Label above, 48px control, hint or error below. Errors are announced to screen readers."
          >
            <Card padding="lg">
              <div className={styles.twoCol}>
                <TextField label="Organization name" placeholder="e.g. Willow Learning" />
                <TextField label="Email domain" defaultValue="willow.example" hint="Must be verified before anyone can join through it." />
                <TextField label="Lesson title" defaultValue="Welcome to the team" data-preview-state="focus" hint="Forced focus state for comparison." />
                <TextField label="Work email" defaultValue="not-an-email" error="Enter an email address like name@company.com." />
                <TextField label="Organization ID" defaultValue="ORG-006" disabled hint="Generated automatically." />
                <Select
                  label="Attempts allowed"
                  defaultValue="3"
                  options={[
                    { value: '1', label: '1 attempt' },
                    { value: '2', label: '2 attempts' },
                    { value: '3', label: '3 attempts' },
                  ]}
                />
              </div>
              <div style={{ marginTop: 24 }}>
                <TextArea label="Description" optional placeholder="Tell learners what this lesson covers." />
              </div>
            </Card>
          </Section>

          {/* 06 Cards */}
          <Section id="cards" title="Cards & stats" note="White surface, 1px border, shadow 01.">
            <div className={styles.threeCol}>
              <StatCard label="Courses in progress" value={3} note="Keep your momentum going" />
              <StatCard label="Lessons completed" value={15} note="Every lesson is a step forward" />
              <StatCard label="Certificates earned" value={2} note="Skills worth celebrating" />
            </div>
            <Card padding="lg">
              <CardHeader
                title="Continue learning"
                subtitle="Mock content — sample course"
                action={<Badge tone="info">Last opened yesterday</Badge>}
              />
              <div className={styles.stack}>
                <p className="eyebrow" style={{ color: 'var(--color-blue)' }}>
                  Data &amp; analytics
                </p>
                <p className="text-h3">Sample course title</p>
                <ProgressBar label="42% complete" value={42} showValue={false} />
                <div>
                  <Button iconEnd="arrowRight">Continue</Button>
                </div>
              </div>
            </Card>
          </Section>

          {/* 07 Badges & avatars */}
          <Section id="badges" title="Badges & avatars" note="Badge text always names the status — colour is never the only signal.">
            <Card padding="lg">
              <div className={styles.stack}>
                <div className={styles.row}>
                  <Badge tone="neutral">Draft</Badge>
                  <Badge tone="info">Published</Badge>
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                  <Badge tone="success">Verified</Badge>
                  <Badge tone="warning" dot>
                    Invited
                  </Badge>
                  <Badge tone="warning">Overdue</Badge>
                  <Badge tone="danger">Not verified</Badge>
                  <Badge tone="violet">General Admin</Badge>
                  <Badge tone="info">Instructor</Badge>
                  <Badge tone="neutral">Learner</Badge>
                </div>
                <div className={styles.row}>
                  <Avatar name="Sample Learner" size="sm" />
                  <Avatar name="Mock Instructor" size="md" />
                  <Avatar name="Demo Admin" size="lg" />
                </div>
              </div>
            </Card>
          </Section>

          {/* 08 Progress & loading */}
          <Section id="progress" title="Progress & loading" note="Progress bars expose their value to screen readers. Skeletons respect reduced-motion settings.">
            <div className={styles.twoCol}>
              <Card padding="lg">
                <div className={styles.stack}>
                  <ProgressBar label="Not started" value={0} />
                  <ProgressBar label="In progress" value={42} />
                  <ProgressBar label="Completed" value={100} tone="success" />
                  <ProgressBar label="Course progress" value={60} hideLabel />
                </div>
              </Card>
              <Card padding="lg" aria-busy="true">
                <div className={styles.stack}>
                  <span className="visually-hidden">Loading example content</span>
                  <Skeleton height={140} />
                  <Skeleton shape="text" width="40%" />
                  <Skeleton shape="text" width="85%" />
                  <Skeleton shape="text" width="60%" />
                  <div className={styles.row}>
                    <Skeleton shape="circle" width={40} height={40} />
                    <Skeleton shape="text" width={160} />
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          {/* 09 Empty states & banners */}
          <Section id="feedback" title="Empty states & banners">
            <Card>
              <EmptyState
                title="Start your first course"
                description="Discover something new. Choose a course from the catalog to start building your skills."
                action={<Button>Browse courses</Button>}
              />
            </Card>
            <div className={styles.stack}>
              <Banner tone="warning" icon="wifiOff">
                <strong>Mock state:</strong> You're offline. Your progress will sync when you reconnect.
                (Offline support is deferred — D7.)
              </Banner>
              <Banner tone="info" icon="refresh">
                <strong>Mock state:</strong> Syncing…
              </Banner>
              <Banner tone="success">Invitation sent to 3 people.</Banner>
              <Banner tone="danger" action={<Button size="sm" variant="neutral">Try again</Button>}>
                We couldn't save your changes.
              </Banner>
            </div>
          </Section>

          {/* 10 Table */}
          <Section id="table" title="Table" note="Mock organizations (fictional .example domains). Scrolls sideways on small screens.">
            <Card padding="none">
              <div style={{ padding: '24px 24px 16px' }}>
                <CardHeader title="All organizations" subtitle="Mock data" action={<Badge tone="info">2 active</Badge>} />
              </div>
              <Table
                caption="Organizations (mock data)"
                columns={orgColumns}
                rows={mockOrgs}
                getRowKey={(org) => org.id}
                footer={
                  <>
                    <span>Showing 4 of 4 organizations</span>
                    <span>2 active · 1 draft · 1 suspended</span>
                  </>
                }
              />
            </Card>
            <Card padding="none">
              <Table caption="Empty table example" captionVisible={false} columns={orgColumns} rows={[]} getRowKey={(org) => org.id} emptyMessage="No organizations match your search." />
            </Card>
          </Section>

          {/* 11 Tabs */}
          <Section id="tabs" title="Tabs" note="Use the Left/Right arrow keys to move between tabs.">
            <Card padding="lg">
              <div className={styles.stack}>
                <Tabs
                  label="Course sections (example)"
                  items={[
                    { id: 'content', label: 'Content', content: <p className="text-muted">Content panel (mock).</p> },
                    { id: 'settings', label: 'Settings', content: <p className="text-muted">Settings panel (mock).</p> },
                    { id: 'certificate', label: 'Certificate', content: <p className="text-muted">Certificate panel (mock).</p> },
                    { id: 'learners', label: 'Learners', content: <p className="text-muted">Learners panel (mock).</p> },
                  ]}
                />
                <Tabs
                  label="Filter courses (example)"
                  variant="pill"
                  items={[
                    { id: 'all', label: 'All courses', count: 6, content: <p className="text-muted">All courses (mock).</p> },
                    { id: 'progress', label: 'In progress', count: 3, content: <p className="text-muted">In progress (mock).</p> },
                    { id: 'not-started', label: 'Not started', count: 1, content: <p className="text-muted">Not started (mock).</p> },
                    { id: 'completed', label: 'Completed', count: 2, content: <p className="text-muted">Completed (mock).</p> },
                  ]}
                />
              </div>
            </Card>
          </Section>

          {/* 12 Layouts */}
          <Section
            id="layouts"
            title="Layouts"
            note="The four shells every screen will use, filled with mock blocks. Links inside these frames are disabled. Resize the browser window to see the tablet and mobile behaviour."
          >
            <Frame label="PublicLayout — landing, course detail, request a demo" note="Mock content">
              <PublicLayout mainId="sample-public-main">
                <div className={styles.mockHero}>
                  <h1 className={`text-h1 ${styles.mockHeroTitle}`}>Sample heading for a public page</h1>
                  <p className="text-lead text-muted" style={{ margin: '16px 0 24px', maxWidth: 560 }}>
                    Mock hero content. The real landing page is built in Phase 2 using hero option A (pending your
                    confirmation of D3).
                  </p>
                  <div className={styles.row}>
                    <Button iconEnd="arrowRight">Browse courses</Button>
                    <Button variant="neutral">Continue with Google</Button>
                  </div>
                </div>
              </PublicLayout>
            </Frame>

            <Frame label="AuthLayout — sign in, invitation, errors" note="Mock content">
              <AuthLayout mainId="sample-auth-main">
                <h1 className="text-h2">Welcome back</h1>
                <p className="text-muted" style={{ margin: '12px 0 32px' }}>
                  Sign in to continue your courses and pick up right where you left off.
                </p>
                <Button variant="neutral" fullWidth>
                  Continue with Google (mock)
                </Button>
              </AuthLayout>
            </Frame>

            <Frame label="AppShell — learner, instructor and admin workspaces" note="Mock content">
              <AppShell
                mainId="sample-shell-main"
                navItems={learnerNav}
                user={mockUser}
                searchPlaceholder="Search courses, lessons…"
                banner={
                  <Banner tone="warning" icon="wifiOff" flush>
                    Mock state: You're offline. Your progress will sync when you reconnect.
                  </Banner>
                }
              >
                <h1 className="text-title">Welcome back, Sample</h1>
                <p className="text-muted" style={{ margin: '8px 0 24px' }}>
                  A little progress, every day. (Mock content.)
                </p>
                <div className={styles.threeCol}>
                  <StatCard label="Courses in progress" value={3} note="Keep your momentum going" />
                  <StatCard label="Lessons completed" value={15} note="Every lesson is a step forward" />
                  <StatCard label="Certificates earned" value={2} note="Skills worth celebrating" />
                </div>
                <div className={styles.mockBlock} style={{ marginTop: 24 }}>
                  Page content area
                </div>
              </AppShell>
            </Frame>

            <Frame label="FocusLayout — course player and quiz" note="Mock content">
              <FocusLayout
                mainId="sample-focus-main"
                back={{ label: 'My courses', to: '/mock/my-courses' }}
                eyebrow="Data & analytics"
                title="Sample course title"
                progress={{ label: 'Your progress', value: 42 }}
                user={mockUser}
                footer={
                  <>
                    <Button variant="secondary">Mark as done</Button>
                    <Button iconEnd="arrowRight">Next lesson</Button>
                  </>
                }
              >
                <div className={styles.focusContent}>
                  <div className={styles.mockBlock} style={{ minHeight: 360, background: 'var(--color-navy)', color: 'var(--color-white)', borderColor: 'transparent' }}>
                    Video player area (presentation only — real video hosting is deferred, D5)
                  </div>
                  <p className="eyebrow" style={{ marginTop: 24, color: 'var(--color-blue)' }}>
                    Module 02 · Lesson 6 of 12
                  </p>
                  <h2 className="text-h3" style={{ marginTop: 8 }}>
                    Sample lesson title
                  </h2>
                </div>
              </FocusLayout>
            </Frame>
          </Section>
        </div>
      </div>
    </div>
  )
}
