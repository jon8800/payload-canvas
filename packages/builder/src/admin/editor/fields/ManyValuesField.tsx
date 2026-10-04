'use client'

import { TextareaInput } from '@payloadcms/ui'
import { useState, type ChangeEvent } from 'react'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  /** Text or number values; numbers drop lines that are not numbers. */
  readonly kind: 'text' | 'number'
  readonly onChange: (value: Array<string | number> | undefined) => void
}

const toText = (value: unknown) => (Array.isArray(value) ? value.map(String).join('\n') : '')

/** Text and number fields with `hasMany`: one value per line. */
export function ManyValuesField({ label, description, path, required, value, kind, onChange }: Props) {
  const [draft, setDraft] = useState(() => ({ text: toText(value), source: value }))
  // The value changed from outside (undo, AI edit): show it.
  if (value !== draft.source) setDraft({ text: toText(value), source: value })

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    const values = kind === 'number' ? lines.map(Number).filter((n) => Number.isFinite(n)) : lines
    const next = values.length > 0 ? values : undefined
    setDraft({ text, source: next })
    onChange(next)
  }

  return (
    <TextareaInput
      description={description ?? 'One value per line.'}
      label={label}
      onChange={handleChange}
      path={path}
      required={required}
      rows={4}
      value={draft.text}
    />
  )
}
