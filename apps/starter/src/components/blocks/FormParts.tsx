// The parts of a form-builder form: one field (label, input, error) and the submit button.
// The site's FormView and the form builder's canvas preview (FormFieldBlock, FormFrame) render
// with these, so the builder shows exactly what the site shows. No hooks and no 'use client':
// server and client components can both use them.
import type { ReactNode } from 'react'
import { renderRichText } from 'payload-canvas/react'
import { fileProblem, formAnswerProblem, type FormFieldConditions } from 'payload-canvas/forms'
import { resolveLink } from '@/lib/links'
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
  /** Consent: the rich text next to the box. */
  text?: unknown
  /** File: allowed types (as in `<input accept>`) and the largest size in MB. */
  accept?: string | null
  maxSize?: number | null
  conditions?: FormFieldConditions | null
}

export type FormDoc = {
  id: string | number
  fields?: FormField[] | null
  submitButtonLabel?: string | null
  confirmationType?: 'message' | 'redirect' | null
  confirmationMessage?: unknown
  redirect?: { url?: string | null } | null
}

export type NamedField = FormField & { name: string }
/** Text, a tick (checkbox, consent) or a chosen file. */
export type Value = string | boolean | File
export type Values = Record<string, Value>

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

/** The values a form starts with: each field's default value. A date default is its day. */
export function initialValues(fields: FormField[]): Values {
  const values: Values = {}
  for (const field of fields) {
    if (!field.name || field.defaultValue === undefined || field.defaultValue === null) continue
    if (typeof field.defaultValue === 'boolean') values[field.name] = field.defaultValue
    else values[field.name] = field.blockType === 'date' ? String(field.defaultValue).slice(0, 10) : String(field.defaultValue)
  }
  return values
}

/** The text an answer sends: a chosen file sends its name (the file goes in its own part). */
export const answerText = (value: Value) => (typeof File !== 'undefined' && value instanceof File ? value.name : String(value))

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

/**
 * The error text for one field, or '' when the value is fine. The same checks run on the server
 * (`formSubmissionConditions` and `formFileUploads` from payload-canvas).
 */
export function validateField(field: NamedField, value: Value | undefined): string {
  if (isFile(value)) return fileProblem({ name: value.name, mimetype: value.type, size: value.size }, field)
  return formAnswerProblem(field, value)
}

function widthClass(width: number | null | undefined): string {
  if (!width || width >= 100) return ''
  return widthClasses.find(([max]) => width <= max)?.[1] ?? ''
}

export const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

/** Input types of the one-line fields. */
const TEXT_TYPES: Record<string, { type: string; autoComplete?: string; inputMode?: 'decimal' | 'tel' | 'url' | 'email' }> = {
  email: { type: 'email', autoComplete: 'email', inputMode: 'email' },
  number: { type: 'number', inputMode: 'decimal' },
  phone: { type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
  url: { type: 'url', autoComplete: 'url', inputMode: 'url' },
  date: { type: 'date' },
}

type InputProps = {
  field: NamedField
  id: string
  value: Value | undefined
  error: string
  onChange: (value: Value) => void
  /** The builder's preview: the input shows but takes no clicks or focus, so a click selects the field. */
  preview?: boolean
  /** The id of the element that labels the input (a consent box's text). */
  labelledBy?: string
}

function FieldInput({ field, id, value, error, onChange, preview, labelledBy }: InputProps): ReactNode {
  const common = {
    id,
    name: field.name,
    required: field.required ?? undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-labelledby': labelledBy,
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
    case 'consent':
      return (
        <input
          {...common}
          type="checkbox"
          className={join(formClasses.checkbox, previewClass)}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'radio':
      return (
        <div className={formClasses.radioList}>
          {field.options?.map((option, index) => (
            <label key={option.value} className={formClasses.radioRow}>
              <input
                {...common}
                // The first button has the field's id, so an error moves the focus to it.
                id={index === 0 ? id : `${id}-${index}`}
                type="radio"
                value={option.value}
                className={join(formClasses.radio, previewClass)}
                checked={text === option.value}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )
    case 'file':
      return (
        <input
          {...common}
          type="file"
          accept={field.accept || undefined}
          className={join(formClasses.file, previewClass)}
          // The browser keeps the chosen file; clearing the choice gives ''.
          onChange={(e) => onChange(e.target.files?.[0] ?? '')}
        />
      )
    case 'hidden':
      return <input type="hidden" name={field.name} value={text} />
    default: {
      const kind = TEXT_TYPES[field.blockType] ?? { type: 'text', autoComplete: field.name === 'name' ? 'name' : undefined }
      return (
        <input
          {...common}
          type={kind.type}
          autoComplete={kind.autoComplete}
          inputMode={kind.inputMode}
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

/** The label text with "(optional)" for a field that is not required. */
function LabelText({ field }: { field: FormField }) {
  return (
    <>
      {field.label}
      {field.required ? null : <span className={formClasses.optional}> (optional)</span>}
    </>
  )
}

/** Under a file input: the allowed types and the size limit. */
function FileHint({ field }: { field: FormField }) {
  const types = (field.accept ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const parts = [types.length > 0 ? types.join(', ') : null, field.maxSize ? `up to ${field.maxSize} MB` : null].filter(Boolean)
  return parts.length > 0 ? <p className={formClasses.hint}>{parts.join(', ')}</p> : null
}

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
  const errorText = error ? (
    <p id={`${inputId}-error`} className={formClasses.fieldError}>
      {error}
    </p>
  ) : null
  if (field.blockType === 'hidden') {
    // Visitors never see it; the builder's preview shows what it sends.
    if (!preview) return <FieldInput field={named} id={inputId} value={value} error="" onChange={onChange} />
    return (
      <div {...attributes} className={formClasses.field}>
        <p className={formClasses.hiddenPreview}>
          Hidden field <code>{name}</code>
          {typeof value === 'string' && value ? ` sends “${value}”` : ''}
        </p>
        {noteText}
      </div>
    )
  }
  if (field.blockType === 'consent') {
    // The text may hold links, so it labels the box instead of wrapping it.
    const textId = `${inputId}-text`
    return (
      <div {...attributes} className={join(formClasses.field, width)}>
        <div className={formClasses.checkboxRow}>
          <FieldInput field={named} id={inputId} value={value} error={error} onChange={onChange} preview={preview} labelledBy={textId} />
          <div id={textId} className={formClasses.consentText}>
            {field.text ? renderRichText(field.text, resolveLink) : field.label}
          </div>
        </div>
        {errorText}
        {noteText}
      </div>
    )
  }
  const input = <FieldInput field={named} id={inputId} value={value} error={error} onChange={onChange} preview={preview} />
  if (field.blockType === 'radio') {
    return (
      <fieldset {...attributes} className={join(formClasses.radioGroup, width)}>
        {field.label ? (
          <legend className={formClasses.legend}>
            <LabelText field={field} />
          </legend>
        ) : null}
        {input}
        {errorText}
        {noteText}
      </fieldset>
    )
  }
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
          <LabelText field={field} />
        </label>
      ) : null}
      {input}
      {field.blockType === 'file' ? <FileHint field={field} /> : null}
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
