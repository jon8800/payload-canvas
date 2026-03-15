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
    <div className="mb-6">
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
        />
        {unit && <span className="text-sm text-zinc-500">{unit}</span>}
      </div>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
    </div>
  )
}
