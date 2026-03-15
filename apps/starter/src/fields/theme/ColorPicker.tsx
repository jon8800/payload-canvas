'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'

export const ColorPickerField: TextFieldClientComponent = function ColorPickerField({ path, field }) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  return (
    <div className="mb-6">
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => setValue(e.target.value)}
          className="size-10 cursor-pointer rounded border border-zinc-300 p-0.5"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
          placeholder="#000000"
          pattern="^#[0-9a-fA-F]{6}$"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <div
          className="size-8 rounded border border-zinc-300"
          style={{ backgroundColor: value || '#000000' }}
        />
      </div>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
    </div>
  )
}
