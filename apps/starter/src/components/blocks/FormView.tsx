'use client'

// The interactive part of the form block: fields, validation and the submission request.
// Inner elements use the Tailwind classes in formClasses.ts. The block definition lists them in
// `classes`, so the generated CSS includes them on the site and in the canvas.
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
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { FORM_SPAM_KEY, HONEYPOT_NAME, hiddenFormFields, isFormFieldShown, type FormSpamValues } from 'payload-canvas/forms'
import { FormFieldView, initialValues, lexicalToText, SubmitButton, validateField, type FormDoc, type NamedField, type Values } from './FormParts'
import { formClasses } from './formClasses'
import { Turnstile } from './Turnstile'

export type { FormDoc } from './FormParts'

type Errors = Record<string, string>
type Status = 'idle' | 'submitting' | 'success' | 'error'

const isNamed = (field: { name?: string | null; blockType: string }): field is NamedField => Boolean(field.name) && field.blockType !== 'message'

const CONNECTION_ERROR = 'Your message was not sent. Check your connection and try again. Your text is still here.'

/** The message of a refused submission (Payload's `errors`), or the connection error. */
async function refusalMessage(response: Response): Promise<string> {
  if (response.status < 400 || response.status >= 500) return CONNECTION_ERROR
  const body = (await response.json().catch(() => null)) as { errors?: Array<{ message?: string; data?: { errors?: Array<{ message?: string }> } }> } | null
  const first = body?.errors?.[0]
  return first?.data?.errors?.[0]?.message || first?.message || CONNECTION_ERROR
}

/** Milliseconds since `start` (a performance.now() time), or null without a start. */
const elapsedSince = (start: number | null) => (start === null ? null : Math.round(performance.now() - start))

const noop = () => () => {}
/** False during the server render and hydration, true after. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

export function FormView({ form, disabled }: { form: FormDoc; disabled: boolean }) {
  const fields = form.fields ?? []
  const idPrefix = useId()
  const hydrated = useHydrated()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<Values>(() => initialValues(fields))
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>('idle')
  const [failure, setFailure] = useState(CONNECTION_ERROR)
  // When the form showed (performance.now()), for the minimum fill time.
  const shownAt = useRef<number | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const siteKey = disabled ? null : form.spamProtection?.turnstileSiteKey || null
  useEffect(() => {
    if (status === 'idle' && shownAt.current === null) shownAt.current = performance.now()
  }, [status])
  const fieldId = (name: string) => `${idPrefix}-${name}`
  // The fields the current answers hide. They update as the visitor types.
  const hidden = hiddenFormFields(fields, values)
  const shown = fields.filter((field) => isFormFieldShown(field, hidden))
  const named = shown.filter(isNamed)

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
            shownAt.current = null
            setToken(null)
            setStatus('idle')
          }}
        >
          Send another message
        </button>
      </div>
    )
  }

  function change(field: NamedField, value: string | boolean) {
    setValues((prev) => ({ ...prev, [field.name]: value }))
    // Re-check only a field that already shows an error, so typing never raises a new one.
    if (errors[field.name]) setErrors((prev) => ({ ...prev, [field.name]: validateField(field, value) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled || status === 'submitting') return
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

    if (siteKey && !token) {
      setFailure('Complete the check above the button, then send again.')
      setStatus('error')
      return
    }

    setStatus('submitting')
    // Hidden fields send nothing, also when the visitor typed in them before they hid.
    const submissionData = Object.entries(values)
      .filter(([field]) => !hidden.has(field))
      .map(([field, value]) => ({ field, value: String(value) }))
    const honeypot = formRef.current?.elements.namedItem(HONEYPOT_NAME)
    const spam: FormSpamValues = {
      honeypot: honeypot instanceof HTMLInputElement ? honeypot.value : '',
      elapsedMs: elapsedSince(shownAt.current),
      ...(token ? { token } : {}),
    }
    try {
      const response = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: form.id, submissionData, [FORM_SPAM_KEY]: spam }),
      })
      if (!response.ok) {
        setFailure(await refusalMessage(response))
        // A Turnstile token works once: ask for a new one.
        if (siteKey) setResetKey((key) => key + 1)
        setStatus('error')
        return
      }
      if (form.confirmationType === 'redirect' && form.redirect?.url) {
        window.location.assign(form.redirect.url)
        return
      }
      setStatus('success')
    } catch {
      setFailure(CONNECTION_ERROR)
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
      <div className={formClasses.fields}>
        {shown.map((field, index) => {
          const key = field.id ?? field.name ?? `field-${index}`
          if (!isNamed(field)) return <FormFieldView key={key} field={field} />
          return (
            <FormFieldView
              key={key}
              field={field}
              id={fieldId(field.name)}
              value={values[field.name]}
              error={errors[field.name] ?? ''}
              onChange={(value) => change(field, value)}
            />
          )
        })}
      </div>
      {/* The honeypot: off screen and out of the tab order, so only bots fill it in. */}
      <div className={formClasses.honeypot} aria-hidden="true">
        <label>
          Website
          <input type="text" name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className={formClasses.footer}>
        {siteKey ? <Turnstile siteKey={siteKey} resetKey={resetKey} onToken={setToken} /> : null}
        {status === 'error' ? (
          <p className={formClasses.error} role="alert">
            {failure}
          </p>
        ) : null}
        <SubmitButton label={form.submitButtonLabel} submitting={submitting} />
      </div>
    </form>
  )
}
