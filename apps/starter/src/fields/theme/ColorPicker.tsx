'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'

export const ColorPickerField: TextFieldClientComponent = function ColorPickerField({ path, field }) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--base) * 0.5)' }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: 40,
            height: 40,
            cursor: 'pointer',
            borderRadius: 'var(--border-radius-m)',
            border: '1px solid var(--theme-elevation-200)',
            padding: 2,
            background: 'var(--theme-input-bg)',
          }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
          placeholder="#000000"
          pattern="^#[0-9a-fA-F]{6}$"
          style={{
            borderRadius: 'var(--border-radius-m)',
            border: '1px solid var(--theme-elevation-200)',
            padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
            fontSize: 'var(--font-body-size-s)',
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
          }}
        />
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--border-radius-m)',
            border: '1px solid var(--theme-elevation-200)',
            backgroundColor: value || '#000000',
          }}
        />
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
