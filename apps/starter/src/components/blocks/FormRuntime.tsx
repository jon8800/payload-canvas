'use client'

// The running form: the `<form>` element, the answers, validation and the submission request.
// The Form block renders it around its children; each field block and the Submit button block
// read it from context (`useFormRuntime`). Layout blocks between them render as usual.
//
// Display conditions (payload-canvas/forms): a field whose rules fail is not shown, not checked
// and not sent. The server hook (formSubmissionConditions) applies the same rules again.
//
// Spam protection (payload-canvas `formSpamProtection`, checked on the server): a honeypot input
// people never see, the time from showing the form to the submit, and a Cloudflare Turnstile check
// when the form uses it and the server has the keys (`spamProtection.turnstileSiteKey` is set).
// They go in the request body as `spam`; the server removes them before storing.
//
// Validation runs on submit, then on every change of a field that has an error. Errors show under
// their field (aria-invalid + aria-describedby) and focus moves to the first invalid field.
// Without JavaScript the browser's own required checks still apply (noValidate is set on hydration).
import { createContext, use, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { FORM_SPAM_KEY, HONEYPOT_NAME, hiddenFormFields, type FormPartClasses, type FormSpamValues } from 'payload-canvas/forms'
import { answerText, initialValues, isEmptyAnswer, lexicalToText, validateField, type FormField, type FormSettings, type NamedField, type Value, type Values } from './FormParts'
import { formClasses } from './formClasses'

type Errors = Record<string, string>
type Status = 'idle' | 'submitting' | 'success' | 'error'

export const CONNECTION_ERROR = 'Your message was not sent. Check your connection and try again. Your text is still here.'

/** What the field blocks and the Submit button block of one form read. */
export type FormRuntime = {
  /** The canvas: inputs show but take no clicks, and nothing is sent. */
  preview: boolean
  /** The input id of a field. */
  fieldId: (name: string) => string
  values: Values
  errors: Errors
  /** The names of the fields the current answers hide. */
  hidden: ReadonlySet<string>
  change: (field: NamedField, value: Value) => void
  /** The form-wide part classes (the Form block's Styles): labels, inputs, help texts, errors, the button. */
  parts: FormPartClasses
  submitting: boolean
  /** The problem list or message of a refused submission, shown above the button. */
  failure: { problems: string[]; message: string } | null
  /** The Cloudflare Turnstile site key when the form uses it, else null. */
  siteKey: string | null
  setToken: (token: string | null) => void
  /** Changes when Turnstile must ask for a new token. */
  turnstileReset: number
  /** The submit button's label from the form's settings. */
  submitLabel: string | null
}

const FormRuntimeContext = createContext<FormRuntime | null>(null)

/** The form around a field block or a Submit button block, or null outside a form (the form builder's preview). */
export function useFormRuntime(): FormRuntime | null {
  return use(FormRuntimeContext)
}

/**
 * What a refused submission says: the problems of Payload's validation errors (one per field, from
 * formSubmissionConditions and formFileUploads), else its first message (a spam refusal, the rate
 * limit), else the connection error.
 */
async function refusal(response: Response): Promise<{ problems: string[]; message: string }> {
  if (response.status < 400 || response.status >= 500) return { problems: [], message: CONNECTION_ERROR }
  type PayloadError = { message?: string; data?: { errors?: Array<{ message?: string }> } }
  const body = (await response.json().catch(() => null)) as { errors?: PayloadError[] } | null
  const problems = (body?.errors ?? []).flatMap((error) => (error.data?.errors ?? []).flatMap((e) => (e.message ? [e.message] : [])))
  return { problems: [...new Set(problems)], message: body?.errors?.[0]?.message || CONNECTION_ERROR }
}

/** Milliseconds since `start` (a performance.now() time), or null without a start. */
const elapsedSince = (start: number | null) => (start === null ? null : Math.round(performance.now() - start))

const noop = () => () => {}
/** False during the server render and hydration, true after. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

const isNamed = (field: FormField): field is NamedField => Boolean(field.name) && field.blockType !== 'message'

type Props = {
  /** The form's id in the forms collection. Null for a form built on a page that is not published yet. */
  formId: string | number | null
  /** Every field of the form, in order (the field blocks inside the Form block). */
  fields: FormField[]
  settings: FormSettings
  /** The canvas: nothing is sent, and inputs take no clicks (a click selects the field block). */
  preview: boolean
  parts: FormPartClasses
  className?: string
  attributes?: Record<string, string>
  /** The form's content: its field blocks, layout blocks and the Submit button block. */
  children: ReactNode
}

/** The `<form>` element with the form's state. A sent form shows the confirmation instead. */
export function FormRoot({ formId, fields, settings, preview, parts, className, attributes, children }: Props) {
  const idPrefix = useId()
  const hydrated = useHydrated()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<Values>(() => initialValues(fields))
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>('idle')
  const [failure, setFailure] = useState<FormRuntime['failure']>(null)
  // When the form showed (performance.now()), for the minimum fill time.
  const shownAt = useRef<number | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const siteKey = preview ? null : settings.spamProtection?.turnstileSiteKey || null
  useEffect(() => {
    if (status === 'idle' && shownAt.current === null) shownAt.current = performance.now()
  }, [status])
  const fieldId = (name: string) => `${idPrefix}-${name}`
  // The fields the current answers hide. They update as the visitor types.
  const hidden = hiddenFormFields(fields, Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Array.isArray(value) ? answerText(value) : value])))
  const named = fields.filter((field): field is NamedField => isNamed(field) && !hidden.has(field.name))

  if (status === 'success') {
    const message = lexicalToText(settings.confirmationMessage) || 'Thank you. We will reply soon.'
    return (
      <div
        {...attributes}
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
            shownAt.current = null
            setToken(null)
            setFailure(null)
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
    // Re-check only a field that already shows an error, so typing never raises a new one. Files
    // are checked as soon as they are chosen: a wrong type or size shows at once.
    if (errors[field.name] || field.blockType === 'file') setErrors((prev) => ({ ...prev, [field.name]: validateField(field, value) }))
  }

  function refuse(message: string, problems: string[] = []) {
    setFailure({ problems, message })
    setStatus('error')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (preview || status === 'submitting') return
    const nextErrors: Errors = {}
    for (const field of named) {
      const error = validateField(field, values[field.name])
      if (error) nextErrors[field.name] = error
    }
    setErrors(nextErrors)
    const firstInvalid = named.find((field) => nextErrors[field.name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(firstInvalid.name))}`)?.focus()
      return
    }
    if (formId === null) {
      refuse('This form is not live yet. Publish the page, then try again.')
      return
    }
    if (siteKey && !token) {
      refuse('Complete the check above the button, then send again.')
      return
    }

    setStatus('submitting')
    setFailure(null)
    // Hidden fields send nothing, also when the visitor typed in them before they hid.
    const sent = Object.entries(values).filter(([field, value]) => !hidden.has(field) && !isEmptyAnswer(value))
    const submissionData = sent.map(([field, value]) => ({ field, value: answerText(value) }))
    // One part per file, named after its field (a field with several files sends several parts).
    const files = sent.flatMap(([field, value]) => (Array.isArray(value) ? value.map((file) => [field, file] as const) : []))
    const honeypot = formRef.current?.elements.namedItem(HONEYPOT_NAME)
    const spam: FormSpamValues = {
      honeypot: honeypot instanceof HTMLInputElement ? honeypot.value : '',
      elapsedMs: elapsedSince(shownAt.current),
      ...(token ? { token } : {}),
    }
    // With files: multipart form data, the JSON in `_payload` and one part per file.
    let body: BodyInit = JSON.stringify({ form: formId, submissionData, [FORM_SPAM_KEY]: spam })
    if (files.length > 0) {
      const data = new FormData()
      data.append('_payload', body)
      for (const [field, file] of files) data.append(field, file)
      body = data
    }
    try {
      const response = await fetch('/api/form-submissions', {
        method: 'POST',
        ...(files.length > 0 ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body,
      })
      if (!response.ok) {
        const { problems, message } = await refusal(response)
        // A Turnstile token works once: ask for a new one.
        if (siteKey) setTurnstileReset((key) => key + 1)
        refuse(message, problems)
        return
      }
      if (settings.confirmationType === 'redirect' && settings.redirect?.url) {
        window.location.assign(settings.redirect.url)
        return
      }
      setStatus('success')
    } catch {
      refuse(CONNECTION_ERROR)
    }
  }

  const runtime: FormRuntime = {
    preview,
    fieldId,
    values,
    errors,
    hidden,
    change,
    parts,
    submitting: status === 'submitting',
    failure: status === 'error' ? failure : null,
    siteKey,
    setToken,
    turnstileReset,
    submitLabel: settings.submitButtonLabel ?? null,
  }
  return (
    <FormRuntimeContext value={runtime}>
      <form
        {...attributes}
        ref={formRef}
        className={className ?? formClasses.fields}
        onSubmit={handleSubmit}
        noValidate={hydrated}
        aria-busy={status === 'submitting' || undefined}
      >
        {children}
        {/* The honeypot: off screen and out of the tab order, so only bots fill it in. */}
        {preview ? null : (
          <div className={formClasses.honeypot} aria-hidden="true">
            <label>
              Website
              <input type="text" name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
        )}
      </form>
    </FormRuntimeContext>
  )
}
