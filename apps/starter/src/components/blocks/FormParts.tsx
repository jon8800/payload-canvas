// The parts of a form-builder form: one field (label, input, description, error) and the submit
// button. The site's FormView and the form builder's canvas preview (FormFieldBlock, FormFrame)
// render with these, so the builder shows exactly what the site shows. No hooks and no 'use
// client': server and client components can both use them (the dropdown and the file drop zone
// are client components of their own).
//
// Field settings (payload-canvas `withFormFieldSettings`): `labelVisibility: 'hidden'` keeps the
// label for screen readers only, `description` shows under the input, `cssClass` goes on the
// field's box, `width` is one of the width presets, radio `display` is list, inline, buttons or
// cards, and a file field takes several files when `multiple` is on.
import type { ReactNode } from 'react'
import { renderRichText } from 'payload-canvas/react'
import { filesProblem, formAnswerProblem, formFieldWidth, isLabelShown, radioDisplay, type FormFieldConditions } from 'payload-canvas/forms'
import { resolveLink } from '@/lib/links'
import { FileDropZone } from './FileDropZone'
import { FormSelect } from './FormSelect'
import { formClasses, join, widthClasses } from './formClasses'

export { join } from './formClasses'

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
  /** Help text under the field. */
  description?: string | null
  /** "hidden": the label is for screen readers only. */
  labelVisibility?: string | null
  /** Classes for the field's box. */
  cssClass?: string | null
  /** Radio: list, inline, buttons or cards. */
  display?: string | null
  /** File: allowed types (as in `<input accept>`), the largest size in MB, several files and their most. */
  accept?: string | null
  maxSize?: number | null
  multiple?: boolean | null
  maxFiles?: number | null
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
/** Text, a tick (checkbox, consent) or the chosen files. */
export type Value = string | boolean | File[]
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
    if (!field.name || field.blockType === 'file' || field.defaultValue === undefined || field.defaultValue === null) continue
    if (typeof field.defaultValue === 'boolean') values[field.name] = field.defaultValue
    else values[field.name] = field.blockType === 'date' ? String(field.defaultValue).slice(0, 10) : String(field.defaultValue)
  }
  return values
}

/** The text an answer sends: chosen files send their names (the files go in their own parts). */
export const answerText = (value: Value) => (Array.isArray(value) ? value.map((file) => file.name).join(', ') : String(value))

/** True for an answer that sends nothing: no text, or no files. */
export const isEmptyAnswer = (value: Value | undefined) => value === undefined || value === '' || (Array.isArray(value) && value.length === 0)

/**
 * The error text for one field, or '' when the value is fine. The same checks run on the server
 * (`formSubmissionConditions` and `formFileUploads` from payload-canvas).
 */
export function validateField(field: NamedField, value: Value | undefined): string {
  if (!Array.isArray(value) || value.length === 0) return formAnswerProblem(field, Array.isArray(value) ? '' : value)
  return filesProblem(
    value.map((file) => ({ name: file.name, mimetype: file.type, size: file.size })),
    field,
  )
}

/** Input types of the one-line fields. */
const TEXT_TYPES: Record<string, { type: string; autoComplete?: string; inputMode?: 'decimal' | 'tel' | 'url' | 'email' }> = {
  email: { type: 'email', autoComplete: 'email', inputMode: 'email' },
  number: { type: 'number', inputMode: 'decimal' },
  phone: { type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
  url: { type: 'url', autoComplete: 'url', inputMode: 'url' },
  date: { type: 'date' },
}

/** The box, the option label and the radio input of each radio display. */
const RADIO_LAYOUTS = {
  list: { box: formClasses.radioList, option: formClasses.radioRow, input: formClasses.radio },
  inline: { box: formClasses.radioInline, option: formClasses.radioRow, input: formClasses.radio },
  // The input stays in the page for the keyboard and screen readers; the pill shows its state.
  buttons: { box: formClasses.radioButtons, option: formClasses.radioButton, input: formClasses.srOnly },
  cards: { box: formClasses.radioCards, option: formClasses.radioCard, input: formClasses.radio },
} as const

type InputProps = {
  field: NamedField
  id: string
  value: Value | undefined
  error: string
  onChange: (value: Value) => void
  /** The ids of the description and the error, for `aria-describedby`. */
  describedBy?: string
  /** The builder's preview: the input shows but takes no clicks or focus, so a click selects the field. */
  preview?: boolean
  /** The id of the element that labels the input (a consent box's text). */
  labelledBy?: string
}

function FieldInput({ field, id, value, error, onChange, describedBy, preview, labelledBy }: InputProps): ReactNode {
  const common = {
    id,
    // The builder's preview sends nothing, so its inputs need no name. With a name, the canvas
    // showed a radio field's default as not ticked.
    name: preview ? undefined : field.name,
    required: field.required ?? undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
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
        <FormSelect
          id={id}
          name={field.name}
          value={text}
          options={field.options ?? []}
          placeholder={placeholder}
          required={field.required ?? undefined}
          invalid={Boolean(error)}
          describedBy={describedBy}
          preview={preview}
          onChange={preview ? undefined : onChange}
        />
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
    case 'radio': {
      const layout = RADIO_LAYOUTS[radioDisplay(field.display)]
      return (
        <div className={layout.box}>
          {field.options?.map((option, index) => (
            <label key={option.value} className={join(layout.option, previewClass)}>
              <input
                {...common}
                // The first button has the field's id, so an error moves the focus to it.
                id={index === 0 ? id : `${id}-${index}`}
                type="radio"
                value={option.value}
                className={layout.input}
                checked={text === option.value}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )
    }
    case 'file':
      return (
        <FileDropZone
          id={id}
          name={field.name}
          files={Array.isArray(value) ? value : []}
          accept={field.accept}
          maxSize={field.maxSize}
          multiple={field.multiple}
          maxFiles={field.maxFiles}
          required={field.required ?? undefined}
          invalid={Boolean(error)}
          describedBy={describedBy}
          preview={preview}
          onChange={preview ? undefined : onChange}
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

/** One field of the form: a message, or a label with its input, description and error. */
export function FormFieldView({ field, id, value, error = '', onChange = ignore, attributes, preview, note }: FieldViewProps) {
  // The field's box: its width preset and its own classes.
  const box = (className: string) => join(className, widthClasses[formFieldWidth(field.width)], field.cssClass?.trim())
  const noteText = note ? <p className={formClasses.note}>{note}</p> : null
  if (field.blockType === 'message') {
    return (
      <div {...attributes} className={box(formClasses.message)}>
        <p className={formClasses.messageText}>{lexicalToText(field.message)}</p>
        {noteText}
      </div>
    )
  }
  const name = field.name || ''
  const inputId = id ?? `form-field-${name}`
  const named = { ...field, name } as NamedField
  const description = field.description?.trim()
  const descriptionId = `${inputId}-description`
  const errorId = `${inputId}-error`
  const describedBy = join(description && descriptionId, error && errorId) || undefined
  const descriptionText = description ? (
    <p id={descriptionId} className={formClasses.hint}>
      {description}
    </p>
  ) : null
  const errorText = error ? (
    <p id={errorId} className={formClasses.fieldError}>
      {error}
    </p>
  ) : null
  const labelClass = isLabelShown(field) ? undefined : formClasses.srOnly
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
      <div {...attributes} className={box(formClasses.field)}>
        <div className={formClasses.checkboxRow}>
          <FieldInput field={named} id={inputId} value={value} error={error} onChange={onChange} describedBy={describedBy} preview={preview} labelledBy={textId} />
          <div id={textId} className={formClasses.consentText}>
            {field.text ? renderRichText(field.text, resolveLink) : field.label}
          </div>
        </div>
        {descriptionText}
        {errorText}
        {noteText}
      </div>
    )
  }
  const input = <FieldInput field={named} id={inputId} value={value} error={error} onChange={onChange} describedBy={describedBy} preview={preview} />
  if (field.blockType === 'radio') {
    return (
      <fieldset {...attributes} className={box(formClasses.radioGroup)}>
        {field.label ? (
          <legend className={join(formClasses.legend, labelClass)}>
            <LabelText field={field} />
          </legend>
        ) : null}
        {input}
        {descriptionText}
        {errorText}
        {noteText}
      </fieldset>
    )
  }
  if (field.blockType === 'checkbox') {
    return (
      <div {...attributes} className={box(formClasses.field)}>
        <label className={formClasses.checkboxRow}>
          {input}
          <span>{field.label}</span>
        </label>
        {descriptionText}
        {errorText}
        {noteText}
      </div>
    )
  }
  return (
    <div {...attributes} className={box(formClasses.field)}>
      {field.label ? (
        <label htmlFor={inputId} className={join(formClasses.label, labelClass)}>
          <LabelText field={field} />
        </label>
      ) : null}
      {input}
      {descriptionText}
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
