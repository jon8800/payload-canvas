// The parts of a form-builder form: one field (label, input, error) and the submit button.
// The site's FormView and the form builder's canvas preview (FormFieldBlock, FormFrame) render
// with these, so the builder shows exactly what the site shows. No hooks and no 'use client':
// server and client components can both use them.
import type { ReactNode } from 'react'
import type { FormFieldConditions } from 'payload-canvas/forms'
import { formClasses, widthClasses } from './formClasses'

export type FormField = {
  id?: string | null
  blockType: string
  name?: string | null
  label?: string | null
  required?: boolean | null
  defaultValue?: string | number | boolean | null
  placeholder?: string | null
  width?: number | null
  options?: Array<{ label: string; value: string }> | null
  message?: unknown
  conditions?: FormFieldConditions | null
}

export type FormDoc = {
  id: string | number
  fields?: FormField[] | null
  submitButtonLabel?: string | null
  confirmationType?: 'message' | 'redirect' | null
  confirmationMessage?: unknown
  redirect?: { url?: string | null } | null
  /** Spam protection settings. `turnstileSiteKey` is set on read when the form shows Turnstile. */
  spamProtection?: { turnstileSiteKey?: string | null } | null
}

export type NamedField = FormField & { name: string }
export type Value = string | boolean
export type Values = Record<string, Value>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function nodeText(node: unknown): string {
  const n = node as { text?: string; children?: unknown[] }
  if (typeof n.text === 'string') return n.text
  return (n.children ?? []).map(nodeText).join('')
}

/** Plain text of a Lexical rich text value, one line per top-level node. */
export function lexicalToText(value: unknown): string {
  if (typeof value === 'string') return value
  const root = (value as { root?: { children?: unknown[] } } | null)?.root
  if (!root?.children) return ''
  return root.children.map(nodeText).join('\n')
}

/** The values a form starts with: each field's default value. */
export function initialValues(fields: FormField[]): Values {
  const values: Values = {}
  for (const field of fields) {
    if (!field.name || field.defaultValue === undefined || field.defaultValue === null) continue
    values[field.name] = typeof field.defaultValue === 'boolean' ? field.defaultValue : String(field.defaultValue)
  }
  return values
}

/** The error text for one field, or '' when the value is fine. */
export function validateField(field: NamedField, value: Value | undefined): string {
  const label = (field.label || field.name).toLowerCase()
  const text = typeof value === 'string' ? value.trim() : ''
  if (field.blockType === 'checkbox') return field.required && value !== true ? 'Tick this box to continue.' : ''
  if (field.required && !text) return field.blockType === 'select' ? `Choose a ${label}.` : `Enter your ${label}.`
  if (field.blockType === 'email' && text && !EMAIL.test(text)) return 'Enter an email address like name@example.com.'
  if (field.blockType === 'number' && text && Number.isNaN(Number(text))) return `Enter a number for ${label}.`
  return ''
}

function widthClass(width: number | null | undefined): string {
  if (!width || width >= 100) return ''
  return widthClasses.find(([max]) => width <= max)?.[1] ?? ''
}

export const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

type InputProps = {
  field: NamedField
  id: string
  value: Value | undefined
  error: string
  onChange: (value: Value) => void
  /** The builder's preview: the input shows but takes no clicks or focus, so a click selects the field. */
  preview?: boolean
}

function FieldInput({ field, id, value, error, onChange, preview }: InputProps): ReactNode {
  const common = {
    id,
    name: field.name,
    required: field.required ?? undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    ...(preview ? { tabIndex: -1, readOnly: true } : {}),
  }
  const previewClass = preview ? formClasses.previewInput : ''
  const text = typeof value === 'string' ? value : ''
  const placeholder = field.placeholder || undefined
  switch (field.blockType) {
    case 'textarea':
      return (
        <textarea
          {...common}
          rows={5}
          placeholder={placeholder}
          className={join(formClasses.input, formClasses.textarea, previewClass)}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        // A native select (keyboard, screen readers and phone pickers work as usual), drawn like the inputs.
        <div className={formClasses.selectWrap}>
          <select
            {...common}
            className={join(formClasses.input, formClasses.select, previewClass)}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{placeholder ?? 'Choose one'}</option>
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
        <input
          {...common}
          type="checkbox"
          className={join(formClasses.checkbox, previewClass)}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
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
          placeholder={placeholder}
          className={join(formClasses.input, previewClass)}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
  }
}

type FieldViewProps = {
  field: FormField
  id?: string
  value?: Value
  error?: string
  onChange?: (value: Value) => void
  /** Spread on the field's root element (the builder's canvas puts its block attributes here). */
  attributes?: Record<string, string>
  preview?: boolean
  /** Shown under the field in the builder's preview, e.g. its display conditions. */
  note?: ReactNode
}

const ignore = () => {}

/** One field of the form: a message, or a label with its input and error. */
export function FormFieldView({ field, id, value, error = '', onChange = ignore, attributes, preview, note }: FieldViewProps) {
  const width = widthClass(field.width)
  const noteText = note ? <p className={formClasses.note}>{note}</p> : null
  if (field.blockType === 'message') {
    return (
      <div {...attributes} className={join(formClasses.message, width)}>
        <p className={formClasses.messageText}>{lexicalToText(field.message)}</p>
        {noteText}
      </div>
    )
  }
  const name = field.name || ''
  const inputId = id ?? `form-field-${name}`
  const named = { ...field, name } as NamedField
  const input = <FieldInput field={named} id={inputId} value={value} error={error} onChange={onChange} preview={preview} />
  const errorText = error ? (
    <p id={`${inputId}-error`} className={formClasses.fieldError}>
      {error}
    </p>
  ) : null
  if (field.blockType === 'checkbox') {
    return (
      <div {...attributes} className={join(formClasses.field, width)}>
        <label className={formClasses.checkboxRow}>
          {input}
          <span>{field.label}</span>
        </label>
        {errorText}
        {noteText}
      </div>
    )
  }
  return (
    <div {...attributes} className={join(formClasses.field, width)}>
      {field.label ? (
        <label htmlFor={inputId} className={formClasses.label}>
          {field.label}
          {field.required ? null : <span className={formClasses.optional}> (optional)</span>}
        </label>
      ) : null}
      {input}
      {errorText}
      {noteText}
    </div>
  )
}

function Spinner() {
  return (
    <svg className={formClasses.spinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** The form's submit button. */
export function SubmitButton({ label, submitting = false, preview }: { label?: string | null; submitting?: boolean; preview?: boolean }) {
  return (
    <button type={preview ? 'button' : 'submit'} className={formClasses.submit} disabled={submitting} tabIndex={preview ? -1 : undefined}>
      {submitting ? <Spinner /> : null}
      {submitting ? 'Sending…' : label || 'Submit'}
    </button>
  )
}
