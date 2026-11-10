'use client'

// `admin.custom.builderFormField`: a text field that names another field of the same form (a
// display condition's "Field"). The builder shows a list of the form's named fields instead of a
// text input, so a typo cannot break the condition. The value stays the field's name.

import { SelectInput } from '@payloadcms/ui'
import { useMemo } from 'react'

import { findBlock, findLocation } from '../../../core/tree'
import type { Block, Layout } from '../../../core/types'
import { FORM_BLOCK, formBlockFields, formFieldsIn } from '../../../forms/pageForms'
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

/**
 * The named fields of the form being edited, as options: "Topic (topic)". On a page: the fields of
 * the Form block that holds `except` (or the selected block); in the form builder: the layout's
 * fields. `except`: the id of a field to leave out (the field itself).
 */
export function useFormFieldOptions(except?: string): { label: string; value: string; title: string }[] {
  const runtime = useRuntime()
  const layout = useEditor(runtime.store, (s) => s.view)
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  return useMemo(() => {
    const out: { label: string; value: string; title: string }[] = []
    for (const block of formFieldsAround(layout, except ?? selectedId)) {
      const name = block.props?.name
      if (block.id === except || typeof name !== 'string' || !name.trim()) continue
      if (out.some((o) => o.value === name)) continue
      const text = typeof block.props?.label === 'string' && block.props.label.trim() ? block.props.label.trim() : name
      out.push({ label: text === name ? name : `${text} (${name})`, value: name, title: text })
    }
    return out
  }, [layout, except, selectedId])
}

/** The Form block that holds `blockId` (or is it), or null: the form builder's layout is one form. */
export function formBlockAround(layout: Layout, blockId: string | null | undefined): Block | null {
  if (!blockId) return null
  for (let id: string | null = blockId; id; id = findLocation(layout, id)?.parentId ?? null) {
    const block = findBlock(layout, id)
    if (block?.type === FORM_BLOCK) return block
  }
  return null
}

/** The fields of the form around `blockId`: its Form block's fields, else every field of the layout. */
export function formFieldsAround(layout: Layout, blockId: string | null | undefined): Block[] {
  const form = formBlockAround(layout, blockId)
  return form ? formBlockFields(form) : formFieldsIn(layout.blocks)
}

export function FormFieldNameField({ label, description, path, value, required, onChange }: Props) {
  const fields = useFormFieldOptions(propPathOf(path)?.blockId)
  const current = typeof value === 'string' ? value : ''
  // A name no field has any more stays visible, so the editor sees what to fix.
  const options = current && !fields.some((o) => o.value === current) ? [...fields, { label: `${current} (not in this form)`, value: current, title: current }] : fields

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
