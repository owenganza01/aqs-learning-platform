import { Badge, Card } from '../../components/ui'
import { PLATFORM_TUTORIALS, type PlatformTutorial } from '../../content/public-site'
import { youtubeEmbedUrl } from '../../live/components/VideoPlayer/player-model'
import styles from './PlatformTutorials.module.css'

/*
 * "Platform tutorials" section of the Courses page (client request, 11 November 2026): two public
 * videos on finding your way around AQS, kept apart from the course list. Open to everyone, signed
 * in or not. A tutorial without an approved video (content/public-site.ts) shows "Coming later" and
 * plays nothing (P21, D24: unavailable features never appear to work).
 */
export function PlatformTutorials({ tutorials = PLATFORM_TUTORIALS }: { tutorials?: PlatformTutorial[] }) {
  return (
    <section className={styles.section} aria-labelledby="tutorials-heading">
      <h2 className={styles.heading} id="tutorials-heading">
        Platform tutorials
      </h2>
      <p className={styles.intro}>Short videos on finding your way around AQS. No sign-in needed.</p>
      <ul className={styles.grid} aria-label="Platform tutorials">
        {tutorials.map((tutorial) => (
          <li key={tutorial.id}>
            <Card as="article" className={styles.card}>
              <TutorialVideo tutorial={tutorial} />
              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <h3 className={styles.title}>{tutorial.title}</h3>
                  {tutorial.youtubeId ? null : <Badge>Coming later</Badge>}
                </div>
                <p className={styles.description}>{tutorial.description}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TutorialVideo({ tutorial }: { tutorial: PlatformTutorial }) {
  if (!tutorial.youtubeId) {
    return (
      <div className={styles.unavailable}>
        <span>Video coming later</span>
      </div>
    )
  }
  const lang = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en'
  return (
    <div className={styles.frame}>
      <iframe
        src={youtubeEmbedUrl(tutorial.youtubeId, tutorial.spokenLanguage, lang)}
        title={`Video: ${tutorial.title}`}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className={styles.iframe}
      />
    </div>
  )
}
