'use client'

import { useState } from 'react'

type FormField = {
  blockType: string
  name?: string
  label?: string
  required?: boolean
  defaultValue?: string | boolean
  width?: number
  options?: Array<{ label: string; value: string }>
  message?: object
}

type FormClientProps = {
  formId: string
  fields: FormField[]
  submitButtonLabel?: string
  confirmationType?: 'message' | 'redirect'
  confirmationMessage?: string
  redirectUrl?: string
}

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'

function renderField(
  field: FormField,
  formData: Record<string, string | boolean>,
  onChange: (name: string, value: string | boolean) => void,
) {
  const { blockType, name, label, required, defaultValue, width, options, message } = field

  if (blockType === 'message') {
    if (typeof message === 'string') {
      return <div className="mb-4" dangerouslySetInnerHTML={{ __html: message }} />
    }
    return null
  }

  if (!name) return null

  const wrapperStyle = width ? { width: `${width}%` } : undefined
  const inputClasses = 'border rounded-md px-3 py-2 text-sm w-full'

  let input: React.ReactNode = null

  switch (blockType) {
    case 'text':
      input = (
        <input
          type="text"
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
        />
      )
      break
    case 'email':
      input = (
        <input
          type="email"
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
        />
      )
      break
    case 'textarea':
      input = (
        <textarea
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
          rows={4}
        />
      )
      break
    case 'number':
      input = (
        <input
          type="number"
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
        />
      )
      break
    case 'select':
      input = (
        <select
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
        >
          <option value="">Select...</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )
      break
    case 'checkbox':
      return (
        <div className="flex items-center gap-2 mb-4" style={wrapperStyle}>
          <input
            type="checkbox"
            name={name}
            required={required}
            checked={(formData[name] as boolean) ?? false}
            onChange={(e) => onChange(name, e.target.checked)}
            className="size-4"
          />
          {label && <label className="text-sm font-medium">{label}</label>}
        </div>
      )
    case 'country':
    case 'state':
      input = (
        <input
          type="text"
          name={name}
          required={required}
          value={(formData[name] as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClasses}
        />
      )
      break
    default:
      return null
  }

  return (
    <div className="flex flex-col gap-1.5 mb-4" style={wrapperStyle}>
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {input}
    </div>
  )
}

export function FormClient({
  formId,
  fields,
  submitButtonLabel,
  confirmationType,
  confirmationMessage,
  redirectUrl,
}: FormClientProps) {
  const [formData, setFormData] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {}
    for (const field of fields) {
      if (field.name && field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue
      }
    }
    return initial
  })
  const [state, setState] = useState<SubmissionState>('idle')

  if (state === 'success' && confirmationType !== 'redirect') {
    return (
      <div className="rounded-md bg-green-50 p-4 text-green-800 text-sm">
        {confirmationMessage || 'Form submitted successfully.'}
      </div>
    )
  }

  function handleChange(name: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('submitting')

    const submissionData = Object.entries(formData).map(([field, value]) => ({
      field,
      value: String(value),
    }))

    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || ''
      const res = await fetch(`${serverUrl}/api/form-submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: formId, submissionData }),
      })

      if (!res.ok) throw new Error('Submission failed')

      if (confirmationType === 'redirect' && redirectUrl) {
        window.location.href = redirectUrl
        return
      }

      setState('success')
    } catch {
      setState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((field, i) => (
        <div key={field.name || `field-${i}`}>
          {renderField(field, formData, handleChange)}
        </div>
      ))}

      {state === 'error' && (
        <p className="text-red-600 text-sm mb-4">Something went wrong. Please try again.</p>
      )}

      <button
        type="submit"
        disabled={state === 'submitting'}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        {state === 'submitting' ? 'Submitting...' : (submitButtonLabel || 'Submit')}
      </button>
    </form>
  )
}
