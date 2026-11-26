import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Badge, Button, Card, CardHeader, Select, TextField } from '../../../components/ui'
import {
  clampPlacement,
  DATE_LOCALES,
  FIELD_LABEL,
  FONTS,
  nudge,
  PAGE_SIZES,
  pageSizeValue,
  placementsError,
  pointToFraction,
  REQUIRED_FIELDS,
  SAMPLE,
  type CertificateFieldKey,
  type Placement,
  type Placements,
} from '../../certificate-model'
import { ActionFeedback } from '../../components/States'
import { certificateFileUrl, previewTemplate, templateActions, type CertificateTemplate } from '../../data/certificates'
import { useAction } from '../../useResource'
import styles from './Certificates.module.css'

/*
 * Field placement editor (0026, A11). The template is shown at its page shape with one box per field,
 * filled with sample data ("Jordan Example"). Boxes are dragged with a pointer, or moved with the arrow
 * keys (Shift for bigger steps); every setting also has a labelled input (the accessible alternative).
 * PNG and JPEG templates are shown as the background; a PDF's page cannot be drawn in the browser
 * without a PDF library, so its outline is shown and "Preview with sample data" draws the real result
 * on the server (certificate-url, the same renderer as the generator).
 */

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
]

const pct = (n: number) => Math.round(n * 1000) / 10

function boxStyle(p: Placement, pageWidth: number): CSSProperties {
  const left = p.align === 'center' ? p.x - p.max_width / 2 : p.align === 'right' ? p.x - p.max_width : p.x
  return {
    left: `${left * 100}%`,
    top: `${p.y * 100}%`,
    width: `${p.max_width * 100}%`,
    textAlign: p.align,
    color: p.color,
    fontSize: `${(p.size / pageWidth) * 100}cqw`,
    fontWeight: p.font.endsWith('bold') ? 700 : 400,
    fontFamily: p.font.startsWith('serif') ? 'Times New Roman, Times, serif' : 'Helvetica, Arial, sans-serif',
  }
}

export function CertificateTemplateEditor({ template, onSaved, onClose }: { template: CertificateTemplate; onSaved: () => void; onClose: () => void }) {
  const [name, setName] = useState(template.name)
  const [placements, setPlacements] = useState<Placements>(template.placements)
  const [dateLocale, setDateLocale] = useState(template.dateLocale)
  const [pageSize, setPageSize] = useState(pageSizeValue(template.pageWidth, template.pageHeight))
  const [selected, setSelected] = useState<CertificateFieldKey>('participant_name')
  const [background, setBackground] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ key: CertificateFieldKey; dx: number; dy: number } | null>(null)

  const page = PAGE_SIZES.find((p) => p.value === pageSize) ?? PAGE_SIZES[0]
  const pageWidth = template.kind === 'pdf' ? template.pageWidth : page.width
  const pageHeight = template.kind === 'pdf' ? template.pageHeight : page.height
  const keys: CertificateFieldKey[] = [...REQUIRED_FIELDS, ...(placements.signatory ? (['signatory'] as const) : [])]
  const current = (selected === 'signatory' ? placements.signatory : placements[selected]) ?? placements.participant_name

  useEffect(() => {
    if (template.kind === 'pdf') return
    let live = true
    certificateFileUrl('template', template.id).then(
      (r) => live && setBackground(r.url),
      () => live && setBackground(null),
    )
    return () => {
      live = false
    }
  }, [template.id, template.kind])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const update = (key: CertificateFieldKey, patch: Partial<Placement> & { text?: string }) => {
    setMessage(null)
    setPlacements((prev) => {
      if (key === 'signatory') {
        if (!prev.signatory) return prev
        return { ...prev, signatory: { ...clampPlacement({ ...prev.signatory, ...patch }), text: patch.text ?? prev.signatory.text } }
      }
      return { ...prev, [key]: clampPlacement({ ...prev[key], ...patch }) }
    })
  }

  const placementOf = (key: CertificateFieldKey) => (key === 'signatory' ? placements.signatory : placements[key]) as Placement

  const onPointerDown = (key: CertificateFieldKey) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return
    const at = pointToFraction(event.clientX, event.clientY, box)
    const p = placementOf(key)
    drag.current = { key, dx: at.x - p.x, dy: at.y - p.y }
    setSelected(key)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!drag.current || !box) return
    const at = pointToFraction(event.clientX, event.clientY, box)
    update(drag.current.key, { x: at.x - drag.current.dx, y: at.y - drag.current.dy })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const save = useAction(async () => {
    const problem = placementsError(placements)
    if (problem) throw Object.assign(new Error(problem), { code: '22023', message: `AQS: ${problem}` })
    await templateActions.save({ id: template.id, name, placements, dateLocale, pageWidth, pageHeight })
    setMessage('Template saved.')
    onSaved()
  })
  const preview = useAction(async () => {
    const problem = placementsError(placements)
    if (problem) throw Object.assign(new Error(problem), { code: '22023', message: `AQS: ${problem}` })
    const blob = await previewTemplate(template.id, placements, dateLocale)
    setPreviewUrl(URL.createObjectURL(blob))
  })

  const canvasStyle: CSSProperties = {
    aspectRatio: `${pageWidth} / ${pageHeight}`,
    backgroundImage: background ? `url("${background}")` : undefined,
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="template-editor-heading">
      <CardHeader
        title={<span id="template-editor-heading">Edit “{template.name}”</span>}
        subtitle="Place each field on your design. Drag a box, or select it and use the arrow keys."
        headingLevel="h2"
        size="md"
        action={
          <Button variant="text" onClick={onClose}>
            Close editor
          </Button>
        }
      />
      <div className={styles.editor}>
        <div>
          <div ref={canvasRef} className={styles.canvas} style={canvasStyle} role="group" aria-label="Certificate page with field boxes">
            {keys.map((key) => {
              const p = placementOf(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.fieldBox}
                  style={boxStyle(p, pageWidth)}
                  aria-pressed={selected === key}
                  aria-label={`${FIELD_LABEL[key]}: ${pct(p.x)}% across, ${pct(p.y)}% down. Arrow keys move it.`}
                  onClick={() => setSelected(key)}
                  onKeyDown={(event) => {
                    const moved = nudge(p, event.key, event.shiftKey)
                    if (!moved) return
                    event.preventDefault()
                    setSelected(key)
                    update(key, { x: moved.x, y: moved.y })
                  }}
                  onPointerDown={onPointerDown(key)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <span className={styles.fieldText}>{key === 'signatory' ? placements.signatory?.text || SAMPLE.signatory : SAMPLE[key]}</span>
                </button>
              )
            })}
            {template.kind === 'pdf' ? (
              <p className={styles.pdfNote}>PDF template: your design is not drawn here. Use “Preview with sample data” to see it.</p>
            ) : null}
          </div>
          {previewUrl ? (
            <div className={styles.form}>
              <iframe className={styles.preview} src={previewUrl} title="Certificate preview with sample data" />
              <a href={previewUrl} download="certificate-preview.pdf">
                Download the preview (PDF)
              </a>
            </div>
          ) : null}
        </div>

        <div className={styles.form}>
          <TextField label="Template name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          {template.kind === 'pdf' ? (
            <p className={styles.muted}>
              Page size: taken from your PDF ({Math.round(template.pageWidth)} × {Math.round(template.pageHeight)} points).
            </p>
          ) : (
            <Select label="Page size" value={pageSize} onChange={(e) => setPageSize(e.target.value)} options={PAGE_SIZES.map((p) => ({ value: p.value, label: p.label }))} />
          )}
          <Select label="Date format" value={dateLocale} onChange={(e) => setDateLocale(e.target.value)} options={DATE_LOCALES} />
          <Select
            label="Field to adjust"
            value={selected}
            onChange={(e) => setSelected(e.target.value as CertificateFieldKey)}
            options={keys.map((k) => ({ value: k, label: FIELD_LABEL[k] }))}
          />
          <fieldset className={styles.fields}>
            <legend className="visually-hidden">{FIELD_LABEL[selected]} settings</legend>
            <div className={styles.fieldGrid}>
              <TextField label="Across (%)" type="number" min={0} max={100} step={0.5} value={pct(current.x)} onChange={(e) => update(selected, { x: Number(e.target.value) / 100 })} />
              <TextField label="Down (%)" type="number" min={0} max={100} step={0.5} value={pct(current.y)} onChange={(e) => update(selected, { y: Number(e.target.value) / 100 })} />
              <TextField label="Text size (pt)" type="number" min={6} max={96} step={1} value={current.size} onChange={(e) => update(selected, { size: Number(e.target.value) })} />
              <TextField label="Maximum width (%)" type="number" min={5} max={100} step={1} value={pct(current.max_width)} onChange={(e) => update(selected, { max_width: Number(e.target.value) / 100 })} />
              <Select label="Alignment" value={current.align} onChange={(e) => update(selected, { align: e.target.value as Placement['align'] })} options={ALIGN_OPTIONS} />
              <Select label="Font" value={current.font} onChange={(e) => update(selected, { font: e.target.value as Placement['font'] })} options={FONTS} />
            </div>
            <label className={styles.colour}>
              Colour
              <input type="color" value={current.color} onChange={(e) => update(selected, { color: e.target.value })} />
            </label>
          </fieldset>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={Boolean(placements.signatory)}
              onChange={(e) => {
                setMessage(null)
                setPlacements((prev) => {
                  if (!e.target.checked) {
                    const rest = { ...prev }
                    delete rest.signatory
                    return rest
                  }
                  return { ...prev, signatory: { ...prev.organization_name, y: 0.88, size: 12, text: '' } }
                })
                if (!e.target.checked && selected === 'signatory') setSelected('participant_name')
              }}
            />
            Add a signatory line
          </label>
          {placements.signatory ? (
            <TextField
              label="Signatory line"
              hint="For example: Dr Sam Example, Head of Training"
              value={placements.signatory.text}
              maxLength={120}
              onChange={(e) => update('signatory', { text: e.target.value })}
            />
          ) : null}
          <p className={styles.muted}>Long names shrink to fit the maximum width, then end with “…”.</p>
          <div className={styles.actions}>
            <Button onClick={() => void save.run()} loading={save.busy}>
              Save template
            </Button>
            <Button variant="secondary" onClick={() => void preview.run()} loading={preview.busy}>
              Preview with sample data
            </Button>
            {template.isActive ? <Badge tone="success">Active</Badge> : null}
          </div>
          <ActionFeedback error={save.error ?? preview.error} success={message} />
        </div>
      </div>
    </Card>
  )
}
