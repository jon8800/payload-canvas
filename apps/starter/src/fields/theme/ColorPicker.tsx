'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import { Popover } from '@base-ui/react/popover'
import { HexColorPicker } from 'react-colorful'
import { useState } from 'react'
import './ColorPicker.scss'

const PRESET_COLORS = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#f43f5e',
]

export const ColorPickerField: TextFieldClientComponent = function ColorPickerField({ path, field }) {
  const { value, setValue } = useField<string>({ path })
  const [hexInput, setHexInput] = useState(value || '')

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  function handleHexBlur() {
    const trimmed = hexInput.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      setValue(trimmed)
    } else if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
      setValue(`#${trimmed}`)
      setHexInput(`#${trimmed}`)
    } else {
      setHexInput(value || '')
    }
  }

  function handlePresetClick(color: string) {
    setValue(color)
    setHexInput(color)
  }

  function handleClear() {
    setValue('')
    setHexInput('')
  }

  // Sync local hex input when value changes externally
  const displayHex = hexInput !== value ? hexInput : (value || '')

  return (
    <div className="color-picker-field">
      <label className="color-picker-field__label">{label}</label>
      <div className="color-picker-field__controls">
        <Popover.Root>
          <Popover.Trigger className="color-picker-field__swatch" style={{ backgroundColor: value || '#000000' }} />
          <Popover.Portal>
            <Popover.Positioner sideOffset={4}>
              <Popover.Popup className="color-picker-field__popover">
                <div className="color-picker-field__wheel">
                  <HexColorPicker
                    color={value || '#000000'}
                    onChange={(newColor) => {
                      setValue(newColor)
                      setHexInput(newColor)
                    }}
                  />
                </div>
                <div className="color-picker-field__presets">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="color-picker-field__preset-swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => handlePresetClick(color)}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>
                <button type="button" className="color-picker-field__clear-btn" onClick={handleClear}>
                  Clear
                </button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <input
          type="text"
          className="color-picker-field__hex-input"
          value={displayHex}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleHexBlur()
          }}
          placeholder="#000000"
        />
      </div>
      {description && <p className="color-picker-field__description">{description}</p>}
    </div>
  )
}
