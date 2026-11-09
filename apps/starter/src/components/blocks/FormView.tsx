'use client'

// The interactive part of the form block: fields, validation and the submission request.
// Inner elements use the Tailwind classes in formClasses.ts. The block definition lists them in
// `classes`, so the generated CSS includes them on the site and in the canvas.
//
// Display conditions (payload-canvas/forms): a field whose rules fail is not shown, not checked
// and not sent. The server hook (formSubmissionConditions) applies the same rules again.
//
// Validation runs on submit, then on every change of a field that has an error. Errors show under
// their field (aria-invalid + aria-describedby) and focus moves to the first invalid field.
// Without JavaScript the browser's own required checks still apply (noValidate is set on hydration).
import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { hiddenFormFields, isFormFieldShown } from 'payload-canvas/forms'
import { answerText, FormFieldView, initialValues, lexicalToText, SubmitButton, validateField, type FormDoc, type NamedField, type Value, type Values } from './FormParts'
import { formClasses } from './formClasses'

export type { FormDoc } from './FormParts'

type Errors = Record<string, string>
type Status = 'idle' | 'submitting' | 'success' | 'error'

const isNamed = (field: { name?: string | null; blockType: string }): field is NamedField => Boolean(field.name) && field.blockType !== 'message'

/** The messages of a Payload validation error response, or none. */
async function errorMessages(response: Response): Promise<string[]> {
  type PayloadError = { message?: string; data?: { errors?: Array<{ message?: string }> } }
  const body = (await response.json().catch(() => null)) as { errors?: PayloadError[] } | null
  const messages = (body?.errors ?? []).flatMap((error) => {
    const inner = (error.data?.errors ?? []).flatMap((e) => (e.message ? [e.message] : []))
    return inner.length > 0 ? inner : []
  })
  return [...new Set(messages)]
}

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
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const fieldId = (name: string) => `${idPrefix}-${name}`
  // The fields the current answers hide. They update as the visitor types.
  const hidden = hiddenFormFields(fields, Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value instanceof File ? value.name : value])))
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

    setStatus('submitting')
    setServerErrors([])
    // Hidden fields send nothing, also when the visitor typed in them before they hid.
    const sent = Object.entries(values).filter(([field, value]) => !hidden.has(field) && value !== '')
    const submissionData = sent.map(([field, value]) => ({ field, value: answerText(value) }))
    const files = sent.filter((entry): entry is [string, File] => entry[1] instanceof File)
    // With files: multipart form data, the JSON in `_payload` and one part per file field.
    let body: BodyInit = JSON.stringify({ form: form.id, submissionData })
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
        // The server's own checks (formSubmissionConditions, formFileUploads) say what is wrong.
        setServerErrors(await errorMessages(response))
        throw new Error(`Submission failed with status ${response.status}`)
      }
      if (form.confirmationType === 'redirect' && form.redirect?.url) {
        window.location.assign(form.redirect.url)
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
      <div className={formClasses.footer}>
        {status === 'error' ? (
          <div className={formClasses.error} role="alert">
            {serverErrors.length > 0 ? (
              <>
                <p className={formClasses.errorText}>Your message was not sent. Fix this and try again:</p>
                <ul className={formClasses.errorList}>
                  {serverErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={formClasses.errorText}>Your message was not sent. Check your connection and try again. Your text is still here.</p>
            )}
          </div>
        ) : null}
        <SubmitButton label={form.submitButtonLabel} submitting={submitting} />
      </div>
    </form>
  )
}
