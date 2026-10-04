'use client'

import { Popover } from '@base-ui/react/popover'
import { useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useState } from 'react'
import { HexColorPicker } from 'react-colorful'

import { FieldShell, labelText } from './FieldShell'
import './fields.scss'

const PRESETS = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#f43f5e',
]

/** `#abc` or `abcdef` as `#aabbcc`, lower case. `null` if it is not a hex color. */
function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`
  return null
}

/** A hex color: a swatch that opens a picker with presets, and a hex input. Empty means "not set". */
export const ThemeColorField: TextFieldClientComponent = function ThemeColorField({ path, field, readOnly }) {
  const { value, setValue, disabled } = useField<string>({ path })
  const locked = Boolean(readOnly || disabled)
  // The hex input's text while the user types. `null`: show the stored value.
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) return
    if (draft.trim() === '') setValue('')
    else {
      const hex = normalizeHex(draft)
      if (hex) setValue(hex)
    }
    setDraft(null)
  }

  return (
    <FieldShell field={field} path={path} className="theme-color">
      <div className="theme-color__controls">
        <Popover.Root>
          <Popover.Trigger
            className={`theme-color__swatch${value ? '' : ' theme-color__swatch--empty'}`}
            style={value ? { backgroundColor: value } : undefined}
            disabled={locked}
            aria-label={`${labelText(field, path)}: ${value || 'not set'}. Open the color picker`}
          />
          <Popover.Portal>
            <Popover.Positioner sideOffset={4} className="theme-popover">
              <Popover.Popup className="theme-color__popup">
                <HexColorPicker color={value || '#000000'} onChange={(hex) => setValue(hex)} />
                <div className="theme-color__presets">
                  {PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="theme-color__preset"
                      style={{ backgroundColor: color }}
                      onClick={() => setValue(color)}
                      aria-label={`Use ${color}`}
                    />
                  ))}
                </div>
                <button type="button" className="theme-color__clear" onClick={() => setValue('')}>
                  Clear (use the CSS default)
                </button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <input
          type="text"
          className="theme-color__hex"
          value={draft ?? value ?? ''}
          placeholder="Not set"
          disabled={locked}
          spellCheck={false}
          aria-label={`${labelText(field, path)} hex color`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') setDraft(null)
          }}
        />
      </div>
    </FieldShell>
  )
}
