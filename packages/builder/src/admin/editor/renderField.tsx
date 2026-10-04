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
import { Fragment, type ChangeEvent, type ReactNode } from 'react'
import type { Field, OptionObject } from 'payload'

import { getBlockDefinition } from '../../core'
import type { Block } from '../../core/types'

import { ArrayField } from './fields/ArrayField'
import { isStructuralChange } from './fields/arrayState'
import { CheckedTextField, NumberField } from './fields/CheckedInputs'
import { FieldSection, GroupField } from './fields/GroupField'
import { JsonField } from './fields/JsonField'
import { ManyValuesField } from './fields/ManyValuesField'
import { PointField } from './fields/PointField'
import { RichTextField } from './fields/RichTextField'
import { asId, formatProblem, fromRelationshipInput, isFieldVisible, isRecord, toRelationshipInput, type FieldShape } from './fields/values'
import { useRuntime } from './runtime'
import { BindingScopeProvider, FieldSlot } from './templates/Bindable'
import './fields/fields.scss'

type Props = {
  readonly field: Field
  /** Unique, non-form path. Payload uses it for element ids only. It is never written to form state. */
  readonly path: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (isRecord(value)) {
    if (typeof value.en === 'string') return value.en
    return Object.values(value).find((v): v is string => typeof v === 'string')
  }
  return undefined
}

export function fieldLabel(field: Field): string {
  const label = 'label' in field ? text(field.label) : undefined
  if (label) return label
  const name = 'name' in field ? field.name : ''
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function fieldDescription(field: Field): string | undefined {
  return text((field.admin as { description?: unknown } | undefined)?.description)
}

function toOptions(options: unknown[]): OptionObject[] {
  return options.map((o) => (typeof o === 'string' ? { label: o, value: o } : (o as OptionObject)))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/** The id Payload's CheckboxInput puts on its <input>. Must be a valid, unique HTML id. */
const domId = (path: string) => `field-${path.replace(/\W/g, '__')}`

function Unsupported({ label, reason }: { label: string; reason: string }) {
  return (
    <p className="builder-editor__hint">
      {label}: {reason}
    </p>
  )
}

/**
 * Maps one Payload field config to Payload's public controlled input component.
 * The inputs read `value` and report changes through `onChange`. They never touch Payload form state.
 * Adapters: UploadInput needs `api` and emits the stored shape itself. RelationshipInput uses
 * `{ relationTo, value }`: we store IDs, or `{ relationTo, value: id }` for polymorphic fields.
 * SelectInput returns the option object. DatePicker returns a Date, stored as an ISO string.
 */
export function RenderBlockField({ field, onChange, path, value }: Props) {
  const { config } = useConfig()
  const label = fieldLabel(field)
  const description = fieldDescription(field)
  const required = 'required' in field ? Boolean(field.required) : false

  switch (field.type) {
    case 'text':
    case 'email': {
      if (field.type === 'text' && field.hasMany) {
        return <ManyValuesField description={description} kind="text" label={label} onChange={onChange} path={path} required={required} value={value} />
      }
      if (field.admin?.custom?.builderFormat) {
        return (
          <CheckedTextField
            check={(input) => formatProblem(field as FieldShape, input)}
            description={description}
            label={label}
            onChange={onChange}
            path={path}
            required={required}
            value={asString(value)}
          />
        )
      }
      return (
        <TextInput
          description={description}
          label={label}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          path={path}
          required={required}
          value={asString(value)}
        />
      )
    }

    case 'number': {
      if (field.hasMany) {
        return <ManyValuesField description={description} kind="number" label={label} onChange={onChange} path={path} required={required} value={value} />
      }
      return (
        <NumberField
          description={description}
          label={label}
          limits={{ min: field.min, max: field.max, required }}
          onChange={onChange}
          path={path}
          placeholder={typeof field.defaultValue === 'number' ? String(field.defaultValue) : undefined}
          required={required}
          value={value}
        />
      )
    }

    case 'textarea':
    case 'code':
      return (
        <TextareaInput
          description={description}
          label={label}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          path={path}
          required={required}
          rows={field.type === 'code' ? 8 : 4}
          value={asString(value)}
        />
      )

    case 'select':
    case 'radio': {
      const hasMany = field.type === 'select' && Boolean(field.hasMany)
      return (
        <SelectInput
          description={description}
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
          value={
            hasMany
              ? Array.isArray(value)
                ? (value as string[])
                : []
              : typeof value === 'string'
                ? value
                : typeof field.defaultValue === 'string'
                  ? field.defaultValue
                  : undefined
          }
        />
      )
    }

    case 'checkbox':
      return (
        <CheckboxInput
          checked={value === undefined || value === null ? field.defaultValue === true : value === true}
          id={domId(path)}
          label={label}
          name={path}
          // Unchecking stores `false`, so a field that defaults to true stays off.
          onToggle={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        />
      )

    case 'upload': {
      const hasMany = Boolean(field.hasMany)
      const polymorphic = Array.isArray(field.relationTo)
      const current = hasMany ? (Array.isArray(value) ? value : []) : polymorphic ? value : asId(value)
      return (
        <UploadInput
          allowCreate
          api={config.routes.api}
          description={description}
          displayPreview
          hasMany={hasMany}
          isSortable={hasMany}
          label={label}
          maxRows={field.maxRows}
          // UploadInput emits the stored shape: an ID, IDs, or { relationTo, value } for polymorphic fields.
          onChange={(next: unknown) => onChange(next)}
          path={path}
          relationTo={field.relationTo}
          required={required}
          serverURL={config.serverURL}
          value={(current ?? undefined) as never}
        />
      )
    }

    case 'relationship': {
      const relationTo = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]
      const polymorphic = Array.isArray(field.relationTo)
      const hasMany = Boolean(field.hasMany)
      const current = toRelationshipInput(value, relationTo, polymorphic, hasMany)
      const handle = (next: unknown) => onChange(fromRelationshipInput(next, polymorphic))
      const shared = { description, label, path, relationTo, required }
      return hasMany ? (
        <RelationshipInput {...shared} hasMany isSortable maxRows={field.maxRows} onChange={handle} value={current as never} />
      ) : (
        <RelationshipInput {...shared} hasMany={false} onChange={handle} value={current as never} />
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

    case 'json':
      return <JsonField description={description} label={label} onChange={onChange} path={path} required={required} value={value} />

    case 'point':
      return <PointField description={description} label={label} onChange={onChange} path={path} required={required} value={value} />

    case 'blocks':
      // A blocks field inside a group or array of a block made by fromPayloadBlocks. Blocks fields at
      // the block's own level are slots and never reach the inspector.
      return (
        <JsonField
          description={description ?? 'Nested blocks, as JSON: [{ "blockType": "…", … }].'}
          label={label}
          onChange={onChange}
          path={path}
          required={required}
          value={value}
        />
      )

    case 'richText':
      return <RichTextField label={label} onChange={onChange} path={path} value={value} />

    case 'group':
      return <GroupField fields={field.fields} label={label} description={description} onChange={onChange} path={path} value={value} />

    case 'array':
      return (
        <ArrayField
          description={description}
          fields={field.fields}
          label={label}
          maxRows={field.maxRows}
          onChange={onChange}
          path={path}
          singular={text(field.labels?.singular)}
          value={value}
        />
      )

    default:
      return <Unsupported label={label} reason={`field type “${field.type}” is not supported in the inspector yet.`} />
  }
}

type FieldsProps = {
  readonly fields: Field[]
  /** The object the fields read from: block props, a group value or an array row. */
  readonly data: unknown
  readonly path: string
  /** Receives the whole new object. `undefined` when it became empty. */
  readonly onChange: (data: Record<string, unknown> | undefined) => void
  /**
   * Every field that shares `data`, when `fields` is only part of them (a row, a collapsible or an
   * unnamed tab). Conditions read sibling defaults from it. Default: `fields`.
   */
  readonly scope?: readonly Field[]
}

/**
 * Renders a list of fields against one object. Handles `admin.custom.builderCondition`, hidden
 * fields, and layout-only fields (row, collapsible, unnamed group, unnamed tabs) that share
 * the parent's data. Collapsibles, and unnamed tabs when there are several, get a small heading.
 * Named tabs render as groups.
 */
export function RenderBlockFields({ fields, data, path, onChange, scope = fields }: FieldsProps) {
  const record = isRecord(data) ? data : {}
  const setField = (name: string, value: unknown) => {
    const next = { ...record }
    if (value === undefined || value === null || value === '') delete next[name]
    else next[name] = value
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }

  const out: ReactNode[] = []
  fields.forEach((field, index) => {
    if (!isFieldVisible(field as FieldShape, record, scope)) return
    if (field.type === 'ui' || field.type === 'join') return

    if (field.type === 'collapsible') {
      const shared = <RenderBlockFields fields={field.fields} data={record} path={path} onChange={onChange} scope={scope} />
      const title = text(field.label)
      out.push(title ? <FieldSection key={`layout-${index}`} label={title}>{shared}</FieldSection> : <Fragment key={`layout-${index}`}>{shared}</Fragment>)
      return
    }
    if (field.type === 'row' || (field.type === 'group' && !('name' in field && field.name))) {
      out.push(<RenderBlockFields key={`layout-${index}`} fields={field.fields} data={record} path={path} onChange={onChange} scope={scope} />)
      return
    }
    if (field.type === 'tabs') {
      // Several tabs get their labels as headings; a single tab shows its fields as they are.
      const headed = field.tabs.length > 1
      field.tabs.forEach((tab, tabIndex) => {
        const key = `tab-${index}-${tabIndex}`
        if ('name' in tab && tab.name) {
          const name = tab.name
          out.push(
            <GroupField
              key={key}
              fields={tab.fields}
              label={text(tab.label) ?? name}
              onChange={(value) => setField(name, value)}
              path={`${path}.${name}`}
              value={record[name]}
            />,
          )
          return
        }
        const shared = <RenderBlockFields fields={tab.fields} data={record} path={path} onChange={onChange} scope={scope} />
        const title = headed ? text(tab.label) : undefined
        out.push(title ? <FieldSection key={key} label={title}>{shared}</FieldSection> : <Fragment key={key}>{shared}</Fragment>)
      })
      return
    }
    if (!('name' in field) || !field.name) return
    const name = field.name
    const fieldPath = `${path}.${name}`
    const onFieldChange = (value: unknown) => setField(name, value)
    out.push(
      // The slot adds binding controls (templates, collection lists) around the normal input.
      <FieldSlot key={name} field={field} path={fieldPath} value={record[name]} onChange={onFieldChange} label={fieldLabel(field)}>
        <RenderBlockField field={field} path={fieldPath} value={record[name]} onChange={onFieldChange} />
      </FieldSlot>,
    )
  })
  return <>{out}</>
}

/**
 * The Content tab of the block inspector: every field of the selected block, with conditions.
 * Each changed prop becomes one `update` operation. Edits to the same prop in a burst merge into
 * one undo step.
 */
export function BlockContentFields({ block }: { readonly block: Block }) {
  const runtime = useRuntime()
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  if (!def) return <p className="builder-editor__hint">Unknown block type “{block.type}”.</p>
  if (def.fields.length === 0) return <p className="builder-editor__hint">This block has no content fields.</p>

  const props = block.props ?? {}
  const handleChange = (next: Record<string, unknown> | undefined) => {
    const after = next ?? {}
    const changed = Object.keys(after).filter((key) => after[key] !== props[key])
    const removed = Object.keys(props).filter((key) => !(key in after))
    if (changed.length === 0 && removed.length === 0) return
    const keys = [...changed, ...removed]
    runtime.store.apply(
      {
        type: 'update',
        id: block.id,
        ...(changed.length > 0 ? { props: Object.fromEntries(changed.map((key) => [key, after[key]])) } : {}),
        ...(removed.length > 0 ? { unsetProps: removed } : {}),
      },
      // Typing in a burst merges into one undo step; moving, adding or removing array rows does not.
      keys.length === 1 && !isStructuralChange() ? { mergeKey: `props:${block.id}:${keys[0]}` } : {},
    )
  }

  return (
    <div className="builder-editor__fields">
      <BindingScopeProvider block={block} prefix={`builder.${block.id}.`}>
        <RenderBlockFields fields={def.fields} data={props} path={`builder.${block.id}`} onChange={handleChange} />
      </BindingScopeProvider>
    </div>
  )
}
