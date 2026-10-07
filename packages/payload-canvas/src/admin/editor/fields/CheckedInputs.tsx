'use client'

// Text and number inputs that check what the user types and say what is wrong under the input.
// Payload's own field errors read the document form state, which the inspector never uses.

import { TextInput } from '@payloadcms/ui'
import { useState, type ChangeEvent, type ReactNode } from 'react'

import { parseNumberText, type NumberLimits } from './values'

/** The message under an input. */
export function InputError({ children }: { children: ReactNode }) {
  return (
    <p className="builder-field-error" role="alert">
      {children}
    </p>
  )
}

/** True while focus is inside the wrapped input. React's focus events bubble (focusin / focusout). */
function useFocusWithin() {
  const [focused, setFocused] = useState(false)
  return { focused, handlers: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) } }
}

type BaseProps = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
}

/**
 * A text input with a check (`admin.custom.builderFormat`). The value is stored on every
 * keystroke, as before. The message shows once the input loses focus, so a half-typed link is not
 * flagged.
 */
export function CheckedTextField({
  check,
  onChange,
  value,
  ...props
}: BaseProps & { readonly check: (value: string) => string | null; readonly value: string; readonly onChange: (value: string) => void }) {
  const { focused, handlers } = useFocusWithin()
  const problem = focused ? null : check(value)
  return (
    <div {...handlers}>
      <TextInput {...props} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} showError={problem !== null} value={value} />
      {problem && <InputError>{problem}</InputError>}
    </div>
  )
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)
const asText = (value: unknown) => (typeof value === 'number' ? String(value) : '')

/**
 * A number input that keeps the text as typed. A valid number is stored at once; text that is not
 * a number (yet), or a number outside min/max, stays in the input and is not stored. A wrong number
 * is flagged at once; other text after the input loses focus. Empty text removes the value, so the
 * block default (shown as the placeholder) applies.
 */
export function NumberField({
  value,
  onChange,
  limits,
  placeholder,
  ...props
}: BaseProps & {
  readonly value: unknown
  readonly onChange: (value: number | null) => void
  readonly limits: NumberLimits
  readonly placeholder?: string
}) {
  // `source` is the stored value the text belongs to. A different value came from outside (undo,
  // AI edit, another editor): show it instead of the draft.
  const [draft, setDraft] = useState(() => ({ text: asText(value), source: value }))
  const { focused, handlers } = useFocusWithin()
  if (!same(value, draft.source)) setDraft({ text: asText(value), source: value })

  const result = parseNumberText(draft.text, limits)
  const error = !result.ok && (!focused || !result.partial) ? result.error : null

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    const next = parseNumberText(text, limits)
    if (!next.ok || same(next.value, value)) {
      setDraft({ text, source: value })
      return
    }
    setDraft({ text, source: next.value })
    onChange(next.value)
  }

  return (
    <div
      onFocus={handlers.onFocus}
      onBlur={() => {
        handlers.onBlur()
        // "5." or "05" becomes "5" once the user is done.
        if (result.ok && result.value !== null && draft.text.trim() !== String(result.value)) {
          setDraft({ text: String(result.value), source: draft.source })
        }
      }}
    >
      <TextInput {...props} onChange={handleChange} placeholder={placeholder} showError={error !== null} value={draft.text} />
      {error && <InputError>{typeof value === 'number' ? `${error} The block still uses ${value}.` : error}</InputError>}
    </div>
  )
}
