'use client'

// The interactive part of the form block: fields, validation and the submission request.
// Inner elements use the Tailwind classes in formClasses.ts. The block definition lists them in
// `classes`, so the generated CSS includes them on the site and in the canvas.
//
// Validation runs on submit, then on every change of a field that has an error. Errors show under
// their field (aria-invalid + aria-describedby) and focus moves to the first invalid field.
// Without JavaScript the browser's own required checks still apply (noValidate is set on hydration).
import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { formClasses, widthClasses } from './formClasses'

type FormField = {
  id?: string
  blockType: string
  name?: string
  label?: string
  required?: boolean
  defaultValue?: string | number | boolean
  width?: number
  options?: Array<{ label: string; value: string }>
  message?: unknown
}

export type FormDoc = {
  id: string | number
  fields?: FormField[]
  submitButtonLabel?: string
  confirmationType?: 'message' | 'redirect'
  confirmationMessage?: unknown
  redirect?: { url?: string | null }
}

type NamedField = FormField & { name: string }
type Value = string | boolean
type Values = Record<string, Value>
type Errors = Record<string, string>
type Status = 'idle' | 'submitting' | 'success' | 'error'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function nodeText(node: unknown): string {
  const n = node as { text?: string; children?: unknown[] }
  if (typeof n.text === 'string') return n.text
  return (n.children ?? []).map(nodeText).join('')
}

/** Plain text of a Lexical rich text value, one line per top-level node. */
function lexicalToText(value: unknown): string {
  if (typeof value === 'string') return value
  const root = (value as { root?: { children?: unknown[] } } | null)?.root
  if (!root?.children) return ''
  return root.children.map(nodeText).join('\n')
}

function initialValues(fields: FormField[]): Values {
  const values: Values = {}
  for (const field of fields) {
    if (!field.name || field.defaultValue === undefined || field.defaultValue === null) continue
    values[field.name] = typeof field.defaultValue === 'boolean' ? field.defaultValue : String(field.defaultValue)
  }
  return values
}

const isNamed = (field: FormField): field is NamedField => Boolean(field.name) && field.blockType !== 'message'

/** The error text for one field, or '' when the value is fine. */
function validate(field: NamedField, value: Value | undefined): string {
  const label = (field.label || field.name).toLowerCase()
  const text = typeof value === 'string' ? value.trim() : ''
  if (field.blockType === 'checkbox') return field.required && value !== true ? 'Tick this box to continue.' : ''
  if (field.required && !text) return field.blockType === 'select' ? `Choose a ${label}.` : `Enter your ${label}.`
  if (field.blockType === 'email' && text && !EMAIL.test(text)) return 'Enter an email address like name@example.com.'
  if (field.blockType === 'number' && text && Number.isNaN(Number(text))) return `Enter a number for ${label}.`
  return ''
}

function widthClass(width: number | undefined): string {
  if (!width || width >= 100) return ''
  return widthClasses.find(([max]) => width <= max)?.[1] ?? ''
}

const join = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ')

const noop = () => () => {}
/** False during the server render and hydration, true after. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

function FieldInput({
  field,
  id,
  value,
  error,
  onChange,
}: {
  field: NamedField
  id: string
  value: Value | undefined
  error: string
  onChange: (value: Value) => void
}): ReactNode {
  const common = {
    id,
    name: field.name,
    required: field.required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
  const text = typeof value === 'string' ? value : ''
  switch (field.blockType) {
    case 'textarea':
      return (
        <textarea
          {...common}
          rows={5}
          className={join(formClasses.input, formClasses.textarea)}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        // A native select (keyboard, screen readers and phone pickers work as usual), drawn like the inputs.
        <div className={formClasses.selectWrap}>
          <select {...common} className={join(formClasses.input, formClasses.select)} value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose one</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg className={formClasses.selectIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
      )
    case 'checkbox':
      return (
        <input {...common} type="checkbox" className={formClasses.checkbox} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      )
    default: {
      const type = field.blockType === 'email' || field.blockType === 'number' ? field.blockType : 'text'
      const autoComplete = type === 'email' ? 'email' : field.name === 'name' ? 'name' : undefined
      return (
        <input
          {...common}
          type={type}
          autoComplete={autoComplete}
          inputMode={type === 'number' ? 'decimal' : undefined}
          className={formClasses.input}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
  }
}

function Spinner() {
  return (
    <svg className={formClasses.spinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function FormView({ form, disabled }: { form: FormDoc; disabled: boolean }) {
  const fields = form.fields ?? []
  const named = fields.filter(isNamed)
  const idPrefix = useId()
  const hydrated = useHydrated()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<Values>(() => initialValues(fields))
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>('idle')
  const fieldId = (name: string) => `${idPrefix}-${name}`

  if (status === 'success') {
    const message = lexicalToText(form.confirmationMessage) || 'Thank you. We will reply soon.'
    return (
      <div
        className={formClasses.success}
        aria-live="polite"
        tabIndex={-1}
        ref={(element) => {
          element?.focus()
        }}
      >
        <p className={formClasses.successTitle}>Message sent</p>
        <p className={formClasses.successText}>{message}</p>
        <button
          type="button"
          className={formClasses.again}
          onClick={() => {
            setValues(initialValues(fields))
            setStatus('idle')
          }}
        >
          Send another message
        </button>
      </div>
    )
  }

  function change(field: NamedField, value: Value) {
    setValues((prev) => ({ ...prev, [field.name]: value }))
    // Re-check only a field that already shows an error, so typing never raises a new one.
    if (errors[field.name]) setErrors((prev) => ({ ...prev, [field.name]: validate(field, value) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled || status === 'submitting') return
    const nextErrors: Errors = {}
    for (const field of named) {
      const error = validate(field, values[field.name])
      if (error) nextErrors[field.name] = error
    }
    setErrors(nextErrors)
    const firstInvalid = named.find((field) => nextErrors[field.name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(firstInvalid.name))}`)?.focus()
      return
    }

    setStatus('submitting')
    const submissionData = Object.entries(values).map(([field, value]) => ({ field, value: String(value) }))
    try {
      const response = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: form.id, submissionData }),
      })
      if (!response.ok) throw new Error(`Submission failed with status ${response.status}`)
      if (form.confirmationType === 'redirect' && form.redirect?.url) {
        window.location.href = form.redirect.url
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  const submitting = status === 'submitting'
  return (
    <form
      ref={formRef}
      className={formClasses.form}
      onSubmit={handleSubmit}
      noValidate={hydrated}
      aria-busy={submitting || undefined}
      inert={disabled}
    >
      {fields.map((field, index) => {
        const key = field.id ?? field.name ?? `field-${index}`
        const width = widthClass(field.width)
        if (field.blockType === 'message') {
          return (
            <p key={key} className={join(formClasses.message, width)}>
              {lexicalToText(field.message)}
            </p>
          )
        }
        if (!isNamed(field)) return null
        const id = fieldId(field.name)
        const error = errors[field.name] ?? ''
        const input = <FieldInput field={field} id={id} value={values[field.name]} error={error} onChange={(value) => change(field, value)} />
        const errorText = error ? (
          <p id={`${id}-error`} className={formClasses.fieldError}>
            {error}
          </p>
        ) : null
        if (field.blockType === 'checkbox') {
          return (
            <div key={key} className={join(formClasses.field, width)}>
              <label className={formClasses.checkboxRow}>
                {input}
                <span>{field.label}</span>
              </label>
              {errorText}
            </div>
          )
        }
        return (
          <div key={key} className={join(formClasses.field, width)}>
            {field.label ? (
              <label htmlFor={id} className={formClasses.label}>
                {field.label}
                {field.required ? null : <span className={formClasses.optional}> (optional)</span>}
              </label>
            ) : null}
            {input}
            {errorText}
          </div>
        )
      })}
      <div className={formClasses.footer}>
        {status === 'error' ? (
          <p className={formClasses.error} role="alert">
            Your message was not sent. Check your connection and try again. Your text is still here.
          </p>
        ) : null}
        <button type="submit" className={formClasses.submit} disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? 'Sending…' : form.submitButtonLabel || 'Submit'}
        </button>
      </div>
    </form>
  )
}
