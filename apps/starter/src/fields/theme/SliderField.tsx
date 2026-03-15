'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'

export const SliderField: TextFieldClientComponent = function SliderField({ path, field }) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  const custom = (field.admin?.custom as Record<string, unknown>) || {}
  const min = (custom.min as number) ?? 0
  const max = (custom.max as number) ?? 100
  const step = (custom.step as number) ?? 1
  const unit = (custom.unit as string) ?? ''

  const numericValue = parseFloat(String(value)) || min

  function handleChange(newValue: number) {
    setValue(String(newValue))
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <label
        style={{
          display: 'block',
          marginBottom: 'calc(var(--base) * 0.5)',
          fontSize: 'var(--font-body-size-s)',
          fontWeight: 500,
          color: 'var(--theme-text)',
        }}
      >
        {label}
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--base) * 0.5)',
        }}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--theme-success-500)' }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          style={{
            width: 64,
            borderRadius: 'var(--border-radius-m)',
            border: '1px solid var(--theme-elevation-200)',
            padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
            fontSize: 'var(--font-body-size-s)',
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
          }}
        />
        {unit && (
          <span
            style={{
              fontSize: 'var(--font-body-size-s)',
              color: 'var(--theme-elevation-500)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {description && (
        <p
          style={{
            marginTop: 'calc(var(--base) * 0.25)',
            fontSize: 'var(--font-body-size-s)',
            color: 'var(--theme-elevation-500)',
          }}
        >
          {description}
        </p>
      )}
    </div>
  )
}
