import { useEffect, useState, type ReactNode } from 'react'
import { PublicLayout } from '../../../components/layout/PublicLayout'
import { Badge, ButtonLink, Card, EmptyState, Pagination, Skeleton, TextField } from '../../../components/ui'
import { useAuth } from '../../../lib/auth-context'
import { countOf } from '../../../lib/plural'
import styles from '../../../pages/CatalogPage.module.css'
import { LiveShell } from '../../components/LiveShell'
import { Loaded } from '../../components/States'
import { CATALOG_PAGE_SIZE, listCatalogPage } from '../../data/learning'
import { learnerShell } from '../../navigation'
import { useResource } from '../../useResource'

/*
 * Course catalog at /catalog. Signed-out visitors see the public courses (F1, L8) in the public
 * layout; signed-in people also see their organizations' courses (row rules decide) in the
 * learner shell. Layout from the catalog design draft (CatalogPage.tsx).
 * I7: title search (case-insensitive, on the courses already allowed by the row rules).
 * CM3-2 (G30): the database pages the list (12 per page, `count: 'exact'`) and runs the search,
 * so only one page is fetched; a new search starts again at page 1. Categories come later (OD6).
 */
export default function LiveCatalog() {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  // The search runs in the database; wait for a pause in typing before asking again.
  const [term, setTerm] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  const [paging, setPaging] = useState({ term: '', page: 1 })
  const page = paging.term === term ? paging.page : 1
  const catalog = useResource(() => listCatalogPage(page, term), `catalog:${session?.user.id ?? 'anon'}:${term}:${page}`)

  const body: ReactNode = (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Course catalog</h1>
        <p className={styles.intro}>
          {session ? 'Courses open to you, from your organizations and the public catalog.' : 'Browse our public courses.'}
        </p>
      </header>
      {/* CM3-8: course-card-shaped skeletons while a page of the catalog loads. */}
      {catalog.state === 'loading' ? (
        <CatalogSkeleton />
      ) : (
      <Loaded resource={catalog} label="Loading courses">
        {({ courses, total }) => {
          if (total === 0 && !term) {
            return <EmptyState title="No courses yet" description="New courses will appear here when they are published." />
          }
          const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
          const start = total === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1
          return (
            <>
              <div className={styles.search}>
                <TextField
                  label="Search courses"
                  type="search"
                  placeholder="Search by course title"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <p className={styles.searchCount} role="status">
                  {term ? `${countOf(total, 'course')} match` : countOf(total, 'course')}
                </p>
              </div>
              {courses.length === 0 ? (
                <EmptyState title="No matching courses" description={`No course title contains "${term}". Try another word.`} />
              ) : (
                <>
                  <ul className={styles.grid} aria-label="Courses">
                    {courses.map((course) => (
                      <li key={course.id}>
                        <Card as="article" className={styles.card}>
                          <h2 className={styles.courseTitle}>{course.title}</h2>
                          <p className={styles.meta}>
                            {countOf(course.moduleCount, 'module')} · {countOf(course.lessonCount, 'lesson')}
                          </p>
                          <div className={styles.badges}>
                            <Badge tone={course.visibility === 'public' ? 'info' : 'neutral'}>
                              {course.visibility === 'public' ? 'Public' : 'Your organization'}
                            </Badge>
                          </div>
                          <ButtonLink variant="secondary" to={`/courses/${course.id}`} className={styles.action}>
                            View course
                            <span className="visually-hidden"> {course.title}</span>
                          </ButtonLink>
                        </Card>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    start={start}
                    end={start + courses.length - 1}
                    total={total}
                    onPageChange={(next) => {
                      setPaging({ term, page: next })
                      window.scrollTo({ top: 0 })
                    }}
                    noun="courses"
                    singular="course"
                    label="Course catalog"
                  />
                </>
              )}
            </>
          )
        }}
      </Loaded>
      )}
    </>
  )

  if (!session) {
    return (
      <PublicLayout>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>{body}</div>
      </PublicLayout>
    )
  }
  return <LiveShell shell={learnerShell()}>{body}</LiveShell>
}

/** CM3-8: six course-card-shaped placeholders, in the catalog grid. */
function CatalogSkeleton() {
  return (
    <div aria-busy="true" role="status">
      <span className="visually-hidden">Loading courses</span>
      <ul className={styles.grid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Card as="article" className={styles.card}>
              <Skeleton shape="text" width="75%" height={20} />
              <Skeleton shape="text" width="45%" />
              <Skeleton shape="text" width={72} height={22} />
              <Skeleton height={40} width={140} />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
