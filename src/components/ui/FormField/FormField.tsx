import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import styles from './FormField.module.css'

type FieldProps = {
  /** Visible label. Every field must have one (accessibility). */
  label: string
  /** Helper text shown under the field. */
  hint?: ReactNode
  /** Error message. When set, the field is marked invalid for screen readers. */
  error?: string
  /** Adds "(optional)" after the label. */
  optional?: boolean
}

type FieldWrapperProps = FieldProps & {
  id: string
  children: (describedBy: string | undefined) => ReactNode
}

function FieldWrapper({ id, label, hint, error, optional, children }: FieldWrapperProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}>(optional)</span> : null}
      </label>
      {children(describedBy)}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>

export function TextField({ label, hint, error, optional, id, className, ...rest }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldWrapper id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      {(describedBy) => (
        <input
          id={fieldId}
          className={cx(styles.control, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldWrapper>
  )
}

type TextAreaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ label, hint, error, optional, id, className, ...rest }: TextAreaProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldWrapper id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      {(describedBy) => (
        <textarea
          id={fieldId}
          className={cx(styles.control, styles.textarea, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldWrapper>
  )
}

type SelectProps = FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: Array<{ value: string; label: string }>
  }

export function Select({ label, hint, error, optional, id, className, options, ...rest }: SelectProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldWrapper id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      {(describedBy) => (
        <div className={styles.selectWrap}>
          <select
            id={fieldId}
            className={cx(styles.control, styles.select, className)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} className={styles.selectIcon} />
        </div>
      )}
    </FieldWrapper>
  )
}
