import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import { Banner, ButtonLink, Card, EmptyState } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import styles from './LearnerMessagesPage.module.css'

/*
 * Learner messages at /messages — DEVELOPMENT ONLY (D27). Development placeholder.
 *
 * No learner messages design exists (design audit: Messages is a learner gap), and messaging
 * requirements are not decided: who may write to whom, what is stored and for how long, and how
 * messages relate to an organization (architecture plan Q-C10, deferred). So this page shows the
 * learner layout and an honest empty state. It lists no conversations, offers no compose box and
 * sends, stores or reads nothing.
 */

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }
const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

export default function LearnerMessagesPage() {
  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={MOCK_LEARNER}
      unavailableActions
      banner={
        <Banner tone="info" flush>
          Development placeholder. Messaging is not built: nothing is sent, stored or read.
        </Banner>
      }
    >
      <header className={styles.header}>
        <h1 className={styles.title}>Messages</h1>
        <p className={styles.intro}>Conversations with the instructors of your courses will appear here.</p>
      </header>

      <Card padding="lg" className={styles.card} as="section" aria-label="Conversations">
        <EmptyState
          headingLevel="h2"
          title="Messaging isn't available yet"
          description="Who can message whom, and what is kept, are still being decided. Until then, there are no conversations to show."
          action={
            <ButtonLink to="/my-courses" variant="secondary">
              Go to my courses
            </ButtonLink>
          }
        />
      </Card>

      <Banner tone="warning">
        Development placeholder: messaging requirements are not decided. No conversation, message or attachment is
        shown, sent or saved.
      </Banner>
    </AppShell>
  )
}
