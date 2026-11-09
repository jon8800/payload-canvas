'use client'

// `admin.custom.builderFormField`: a text field that names another field of the same form (a
// display condition's "Field"). The builder shows a list of the form's named fields instead of a
// text input, so a typo cannot break the condition. The value stays the field's name.

import { SelectInput } from '@payloadcms/ui'
import { useMemo } from 'react'

import { propPathOf } from '../live/field'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly value: unknown
  readonly required: boolean
  readonly onChange: (value: unknown) => void
}

export function FormFieldNameField({ label, description, path, value, required, onChange }: Props) {
  const runtime = useRuntime()
  const layout = useEditor(runtime.store, (s) => s.view)
  const own = propPathOf(path)?.blockId
  const current = typeof value === 'string' ? value : ''
  const options = useMemo(() => {
    const out: { label: string; value: string }[] = []
    for (const block of layout.blocks) {
      const name = block.props?.name
      if (block.id === own || typeof name !== 'string' || !name.trim()) continue
      if (out.some((o) => o.value === name)) continue
      const text = typeof block.props?.label === 'string' && block.props.label.trim() ? block.props.label.trim() : name
      out.push({ label: text === name ? name : `${text} (${name})`, value: name })
    }
    // A name no field has any more stays visible, so the editor sees what to fix.
    if (current && !out.some((o) => o.value === current)) out.push({ label: `${current} (not in this form)`, value: current })
    return out
  }, [layout, own, current])

  return (
    <SelectInput
      description={description}
      isClearable={!required}
      label={label}
      name={path}
      onChange={(option: { value: unknown } | { value: unknown }[] | null) => onChange(Array.isArray(option) ? (option[0]?.value ?? null) : (option?.value ?? null))}
      options={options}
      path={path}
      required={required}
      value={current || undefined}
    />
  )
}
