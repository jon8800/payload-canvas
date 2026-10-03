'use client'

// The interactive part of the form block: fields, validation and the submission request.
// Inner elements use a CSS module, not Tailwind: the generated CSS covers only the classes in the
// layout data, so a block's own Tailwind classes would be missing in the canvas.
import { useState, type FormEvent, type ReactNode } from 'react'
import styles from './Form.module.css'

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

type Values = Record<string, string | boolean>
type Status = 'idle' | 'submitting' | 'success' | 'error'

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

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField & { name: string }
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}): ReactNode {
  const common = { id: `form-field-${field.name}`, name: field.name, required: field.required }
  const text = typeof value === 'string' ? value : ''
  switch (field.blockType) {
    case 'textarea':
      return <textarea {...common} rows={4} className={styles.input} value={text} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return (
        <select {...common} className={styles.input} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'checkbox':
      return <input {...common} type="checkbox" className={styles.checkbox} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
    default: {
      const type = field.blockType === 'email' || field.blockType === 'number' ? field.blockType : 'text'
      return <input {...common} type={type} className={styles.input} value={text} onChange={(e) => onChange(e.target.value)} />
    }
  }
}

export function FormView({ form, disabled }: { form: FormDoc; disabled: boolean }) {
  const fields = form.fields ?? []
  const [values, setValues] = useState<Values>(() => initialValues(fields))
  const [status, setStatus] = useState<Status>('idle')

  if (status === 'success') {
    return <div className={styles.success}>{lexicalToText(form.confirmationMessage) || 'Thank you. Your message was sent.'}</div>
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled) return
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

  return (
    <form className={styles.form} onSubmit={handleSubmit} inert={disabled}>
      {fields.map((field, index) => {
        const key = field.id ?? field.name ?? `field-${index}`
        const style = field.width && field.width < 100 ? { width: `calc(${field.width}% - 0.5rem)` } : undefined
        if (field.blockType === 'message') {
          return (
            <p key={key} className={styles.message} style={style}>
              {lexicalToText(field.message)}
            </p>
          )
        }
        if (!field.name) return null
        const named = { ...field, name: field.name }
        const input = (
          <FieldInput field={named} value={values[field.name]} onChange={(value) => setValues((prev) => ({ ...prev, [named.name]: value }))} />
        )
        if (field.blockType === 'checkbox') {
          return (
            <label key={key} className={styles.checkboxRow} style={style}>
              {input}
              {field.label}
            </label>
          )
        }
        return (
          <div key={key} className={styles.field} style={style}>
            {field.label ? (
              <label htmlFor={`form-field-${field.name}`} className={styles.label}>
                {field.label}
                {field.required ? <span className={styles.required}> *</span> : null}
              </label>
            ) : null}
            {input}
          </div>
        )
      })}
      {status === 'error' ? <p className={styles.error}>Something went wrong. Please try again.</p> : null}
      <button type="submit" className={styles.submit} disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : form.submitButtonLabel || 'Submit'}
      </button>
    </form>
  )
}

