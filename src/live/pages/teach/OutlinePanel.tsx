import { useState } from 'react'
import { Button, Card, CardHeader, Icon, Select, TextField, useConfirm } from '../../../components/ui'
import { countOf } from '../../../lib/plural'
import base from '../../../pages/InstructorCoursePage.module.css'
import { ActionFeedback } from '../../components/States'
import { authoring, type AuthoringCourse } from '../../data/authoring'
import type { LessonType } from '../../data/learning'
import { LESSON_TYPE_LABEL } from '../../learner-model'
import { useAction } from '../../useResource'
import styles from './CourseEditor.module.css'

/*
 * Course outline (the "Modules" card of the approved course builder). Reordering uses Move up
 * and Move down buttons, which work by keyboard and screen reader; the design's drag handles
 * would need a pointer. Every change is a checked database function; the list reloads after it.
 */

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const next = list.slice()
  const [item] = next.splice(index, 1)
  next.splice(index + by, 0, item)
  return next
}

export function OutlinePanel({
  course,
  editable,
  selectedId,
  onSelect,
  onChanged,
}: {
  course: AuthoringCourse
  editable: boolean
  selectedId: string | null
  onSelect: (lessonId: string) => void
  onChanged: () => void
}) {
  const [moduleTitle, setModuleTitle] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonType, setLessonType] = useState<LessonType>('reading')
  // CM3-1 (G16): one accessible confirmation instead of window.confirm.
  const { confirm, dialog } = useConfirm()
  const run = useAction(async (work: () => Promise<unknown>) => {
    await work()
    onChanged()
  })
  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0)

  return (
    <Card as="section" padding="md" aria-label="Course modules" className={base.outline}>
      {dialog}
      <CardHeader
        title="Modules"
        subtitle={editable ? 'Use the arrows to reorder modules and lessons.' : 'The outline is locked while the course is not an editable draft.'}
        headingLevel="h2"
        size="md"
      />
      <p className={base.outlineCount}>{countOf(course.modules.length, 'module')}</p>
      <ActionFeedback error={run.error} />

      <ol className={base.moduleList}>
        {course.modules.map((module, moduleIndex) => (
          <li key={module.id}>
            <div className={styles.moduleRow}>
              <div className={base.moduleButton} style={{ cursor: 'default' }}>
                <span>{module.title}</span>
                <span className={base.moduleMeta}>{countOf(module.lessons.length, 'lesson')}</span>
              </div>
              {editable ? (
                <>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={moduleIndex === 0 || run.busy}
                    onClick={() => run.run(() => authoring.reorderModules(course.id, move(course.modules, moduleIndex, -1).map((m) => m.id)))}
                  >
                    <Icon name="chevronUp" size={16} label={`Move ${module.title} up`} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={moduleIndex === course.modules.length - 1 || run.busy}
                    onClick={() => run.run(() => authoring.reorderModules(course.id, move(course.modules, moduleIndex, 1).map((m) => m.id)))}
                  >
                    <Icon name="chevronDown" size={16} label={`Move ${module.title} down`} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={run.busy}
                    onClick={() => {
                      const title = window.prompt('Module title', module.title)
                      if (title && title.trim() && title !== module.title) void run.run(() => authoring.renameModule(module.id, title.trim()))
                    }}
                  >
                    <span aria-hidden="true">✎</span>
                    <span className="visually-hidden">Rename {module.title}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={run.busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete the module “${module.title}”?`,
                        message: 'Its lessons are deleted with it. This cannot be undone.',
                        confirmLabel: 'Delete module',
                      })
                      if (ok) void run.run(() => authoring.deleteModule(module.id))
                    }}
                  >
                    <Icon name="close" size={16} label={`Delete ${module.title}`} />
                  </button>
                </>
              ) : null}
            </div>

            <ul className={base.lessonList}>
              {module.lessons.map((lesson, lessonIndex) => (
                <li key={lesson.id} className={styles.lessonRow}>
                  <button
                    type="button"
                    className={base.lessonButton}
                    aria-current={lesson.id === selectedId ? 'true' : undefined}
                    onClick={() => onSelect(lesson.id)}
                  >
                    <span className={base.lessonTitle}>{lesson.title}</span>
                    <span className={base.lessonMeta}>
                      {LESSON_TYPE_LABEL[lesson.type]}
                      {lesson.isPreview ? ' · Preview' : lesson.previewRequested ? ' · Preview requested' : ''}
                    </span>
                  </button>
                  {editable ? (
                    <>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={lessonIndex === 0 || run.busy}
                        onClick={() => run.run(() => authoring.reorderLessons(module.id, move(module.lessons, lessonIndex, -1).map((l) => l.id)))}
                      >
                        <Icon name="chevronUp" size={16} label={`Move ${lesson.title} up`} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={lessonIndex === module.lessons.length - 1 || run.busy}
                        onClick={() => run.run(() => authoring.reorderLessons(module.id, move(module.lessons, lessonIndex, 1).map((l) => l.id)))}
                      >
                        <Icon name="chevronDown" size={16} label={`Move ${lesson.title} down`} />
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>

            {editable ? (
              adding === module.id ? (
                <form
                  className={styles.addForm}
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if ((await run.run(() => authoring.addLesson(module.id, lessonTitle.trim(), lessonType))).ok) {
                      setLessonTitle('')
                      setAdding(null)
                    }
                  }}
                >
                  <TextField id={`new-lesson-${module.id}`} label="Lesson title" value={lessonTitle} required maxLength={200} onChange={(e) => setLessonTitle(e.target.value)} />
                  <Select
                    id={`new-lesson-type-${module.id}`}
                    label="Lesson type"
                    value={lessonType}
                    onChange={(e) => setLessonType(e.target.value as LessonType)}
                    options={[
                      { value: 'reading', label: 'Reading' },
                      { value: 'video', label: 'Video' },
                      { value: 'quiz', label: 'Quiz' },
                    ]}
                  />
                  <div className={styles.row}>
                    <Button type="submit" size="sm" loading={run.busy}>
                      Add lesson
                    </Button>
                    <Button variant="text" size="sm" onClick={() => setAdding(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button variant="text" size="sm" iconStart="plus" onClick={() => setAdding(module.id)}>
                  Add lesson<span className="visually-hidden"> to {module.title}</span>
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ol>

      {editable ? (
        <form
          className={styles.addForm}
          onSubmit={async (event) => {
            event.preventDefault()
            if ((await run.run(() => authoring.addModule(course.id, moduleTitle.trim()))).ok) setModuleTitle('')
          }}
        >
          <TextField id="new-module" label="New module title" value={moduleTitle} required maxLength={200} onChange={(e) => setModuleTitle(e.target.value)} />
          <div>
            <Button type="submit" variant="neutral" size="sm" loading={run.busy}>
              Add module
            </Button>
          </div>
        </form>
      ) : null}
      <p className={base.outlineFooter}>{countOf(lessonCount, 'lesson')}</p>
    </Card>
  )
}
