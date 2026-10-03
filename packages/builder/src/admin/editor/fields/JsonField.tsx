'use client'

import { TextareaInput } from '@payloadcms/ui'
import { useState, type ChangeEvent } from 'react'

import { parseJsonText, toJsonText } from './values'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

/**
 * A textarea for JSON. Valid JSON is stored as data on every keystroke. Invalid JSON stays in
 * the textarea with an error and is not stored.
 */
export function JsonField({ label, description, path, required, value, onChange }: Props) {
  const [draft, setDraft] = useState(() => ({ text: toJsonText(value), source: value, error: null as string | null }))

  // The value changed from outside (undo, AI edit): show it. Our own edits come back as the
  // same object, so they keep the user's formatting.
  if (value !== draft.source) setDraft({ text: toJsonText(value), source: value, error: null })

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const parsed = parseJsonText(text)
    if (!parsed.ok) {
      setDraft({ text, source: value, error: parsed.error })
      return
    }
    setDraft({ text, source: parsed.value, error: null })
    onChange(parsed.value)
  }

  return (
    <div className="builder-field-json">
      <TextareaInput
        description={description}
        label={label}
        onChange={handleChange}
        path={path}
        required={required}
        rows={6}
        showError={draft.error !== null}
        value={draft.text}
      />
      {draft.error && (
        <p className="builder-field-json__error" role="alert">
          Invalid JSON: {draft.error}
        </p>
      )}
    </div>
  )
}
