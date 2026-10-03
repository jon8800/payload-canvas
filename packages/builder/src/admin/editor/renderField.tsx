'use client'

import {
  CheckboxInput,
  DatePicker,
  FieldLabel,
  RelationshipInput,
  SelectInput,
  TextareaInput,
  TextInput,
  UploadInput,
  useConfig,
} from '@payloadcms/ui'
import type { ChangeEvent } from 'react'
import type { Field, OptionObject } from 'payload'

type Props = {
  readonly field: Field
  /** Unique, non-form path. Payload uses it for element ids only. It is never written to form state. */
  readonly path: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

export function fieldLabel(field: Field): string {
  if ('label' in field && typeof field.label === 'string') return field.label
  const name = 'name' in field ? field.name : ''
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function toOptions(options: unknown[]): OptionObject[] {
  return options.map((o) => (typeof o === 'string' ? { label: o, value: o } : (o as OptionObject)))
}

function asId(value: unknown): null | number | string {
  if (typeof value === 'string' || typeof value === 'number') return value
  // A resolved document (from an older shape) still carries its id.
  if (value && typeof value === 'object' && 'id' in value) return asId((value as { id: unknown }).id)
  return null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/**
 * Maps one Payload field config to Payload's public controlled input component.
 * The inputs read `value` and report changes through `onChange`. They never touch Payload form state.
 * Adapters: UploadInput needs `api`. RelationshipInput uses `{ relationTo, value }` and we store the ID.
 * SelectInput returns the option object. DatePicker returns a Date, stored as an ISO string.
 */
export function RenderBlockField({ field, onChange, path, value }: Props) {
  const { config } = useConfig()
  const label = fieldLabel(field)
  const required = 'required' in field ? Boolean(field.required) : false

  switch (field.type) {
    case 'text':
    case 'email':
      return (
        <TextInput
          label={label}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          path={path}
          required={required}
          value={asString(value)}
        />
      )

    case 'number':
      return (
        <TextInput
          label={label}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const text = e.target.value.trim()
            const number = Number(text)
            onChange(text === '' || Number.isNaN(number) ? null : number)
          }}
          path={path}
          required={required}
          value={asString(value)}
        />
      )

    case 'textarea':
      return (
        <TextareaInput
          label={label}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          path={path}
          required={required}
          rows={4}
          value={asString(value)}
        />
      )

    case 'select':
    case 'radio': {
      const hasMany = field.type === 'select' && Boolean(field.hasMany)
      return (
        <SelectInput
          hasMany={hasMany}
          isClearable={!required}
          label={label}
          name={field.name}
          onChange={(option: { value: unknown } | { value: unknown }[] | null) =>
            onChange(Array.isArray(option) ? option.map((o) => o.value) : (option?.value ?? null))
          }
          options={toOptions(field.options)}
          path={path}
          required={required}
          value={hasMany ? (Array.isArray(value) ? (value as string[]) : []) : typeof value === 'string' ? value : undefined}
        />
      )
    }

    case 'checkbox':
      return (
        <CheckboxInput
          checked={value === true}
          id={`field-${path.replace(/\W/g, '__')}`}
          label={label}
          name={path}
          onToggle={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        />
      )

    case 'upload': {
      if (Array.isArray(field.relationTo) || field.hasMany) {
        return <p className="builder-editor__hint">{label}: polymorphic and hasMany uploads are not supported yet.</p>
      }
      const id = asId(value)
      return (
        <UploadInput
          allowCreate
          api={config.routes.api}
          displayPreview
          label={label}
          // Single, non-polymorphic upload: UploadInput emits the plain ID, or null on remove.
          onChange={(next: unknown) => onChange(asId(next))}
          path={path}
          relationTo={field.relationTo}
          required={required}
          serverURL={config.serverURL}
          value={id ?? undefined}
        />
      )
    }

    case 'relationship': {
      if (field.hasMany) {
        return <p className="builder-editor__hint">{label}: hasMany relationships are not supported yet.</p>
      }
      const relationTo = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]
      const id = asId(value)
      return (
        <RelationshipInput
          hasMany={false}
          label={label}
          // RelationshipInput always emits `{ relationTo, value }`. We store the ID only.
          onChange={(next: { value?: unknown } | null) => onChange(asId(next?.value))}
          path={path}
          relationTo={relationTo}
          required={required}
          value={id === null ? null : { relationTo: relationTo[0], value: id }}
        />
      )
    }

    case 'date': {
      const pickerAppearance = field.admin?.date?.pickerAppearance ?? 'dayOnly'
      return (
        <div className="field-type date-time-field">
          <FieldLabel label={label} path={path} required={required} />
          <div className="field-type__wrap">
            <DatePicker
              onChange={(date: Date | null) => onChange(date ? date.toISOString() : null)}
              pickerAppearance={pickerAppearance}
              value={typeof value === 'string' ? value : undefined}
            />
          </div>
        </div>
      )
    }

    default:
      return (
        <p className="builder-editor__hint">
          {label}: field type “{field.type}” is not supported in the inspector yet.
        </p>
      )
  }
}
