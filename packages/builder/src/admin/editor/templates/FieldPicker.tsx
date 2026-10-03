'use client'

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- the field list is a listbox with option rows */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { BindingField } from '../../../core/types'
import { Icon, type IconName } from '../icons'
import { Popover, stopEditorKeys, usePopover } from '../styles/popover'
import { pickerRows, previewValue, URL_PATH, valueAt, type PickerRow } from './binding'

const TYPE_ICONS: Record<string, IconName> = {
  text: 'text',
  textarea: 'text',
  email: 'mail',
  number: 'hash',
  date: 'calendar',
  select: 'select',
  radio: 'select',
  checkbox: 'check',
  richText: 'richText',
  upload: 'image',
  relationship: 'relation',
  group: 'folder',
  array: 'list',
  $url: 'link',
}

export function typeIcon(type: string): IconName {
  return TYPE_ICONS[type] ?? 'field'
}

/** The icon of a binding field. `$url` is a link whatever type the plugin gives it. */
export function fieldIcon(field: BindingField): IconName {
  return field.path === URL_PATH ? 'link' : typeIcon(field.type)
}

const TYPE_LABELS: Record<string, string> = {
  richText: 'rich text',
  $url: 'link',
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

type PickerProps = {
  popover: ReturnType<typeof usePopover>
  /** e.g. "Fields of Posts". */
  title: string
  fields: BindingField[]
  accept: (field: BindingField) => boolean
  /** Document used for the value hints next to each field. */
  sample: Record<string, unknown> | null
  current: string | null
  onPick: (field: BindingField) => void
  /** Shown when no field fits, e.g. "No text fields in Posts". */
  emptyText: string
}

/** A searchable tree of document fields. Groups and the relationship hop are indented under their parent. */
export function FieldPicker({ popover, title, fields, accept, sample, current, onPick, emptyText }: PickerProps) {
  return (
    <Popover {...popover.props} className="builder-bind__popover" label={title}>
      {popover.open && (
        <PickerBody
          title={title}
          fields={fields}
          accept={accept}
          sample={sample}
          current={current}
          emptyText={emptyText}
          onPick={(field) => {
            popover.hide()
            onPick(field)
          }}
        />
      )}
    </Popover>
  )
}

function PickerBody({ title, fields, accept, sample, current, onPick, emptyText }: Omit<PickerProps, 'popover'>) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => pickerRows(fields, accept, query), [fields, accept, query])
  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows])
  const [active, setActive] = useState(() => Math.max(0, selectable.findIndex((r) => r.field.path === current)))
  const inputRef = useRef<HTMLInputElement>(null)
  const activePath = selectable[Math.min(active, selectable.length - 1)]?.field.path

  useEffect(() => inputRef.current?.focus(), [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    stopEditorKeys(e)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(selectable.length - 1, Math.max(0, i + step)))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = selectable[Math.min(active, selectable.length - 1)]
      if (row) onPick(row.field)
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard navigation for the list
    <div className="builder-bind__picker" onKeyDown={onKeyDown}>
      <div className="builder-bind__picker-head">
        <span className="builder-bind__picker-title">
          <Icon name="bind" size={13} /> {title}
        </span>
      </div>
      <label className="builder-bind__picker-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search fields"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          aria-label="Search fields"
        />
      </label>
      {rows.length === 0 ? (
        <p className="builder-bind__picker-empty">{query.trim() ? `No field matches “${query.trim()}”.` : emptyText}</p>
      ) : (
        <ul className="builder-bind__rows" role="listbox" aria-label={title}>
          {rows.map((row) => (
            <PickerRowItem
              key={row.field.path}
              row={row}
              active={row.field.path === activePath}
              current={row.field.path === current}
              sample={sample}
              onPick={onPick}
              onHover={() => setActive(selectable.indexOf(row))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const scrollIntoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

function PickerRowItem({
  row,
  active,
  current,
  sample,
  onPick,
  onHover,
}: {
  row: PickerRow
  active: boolean
  current: boolean
  sample: Record<string, unknown> | null
  onPick: (field: BindingField) => void
  onHover: () => void
}) {
  const { field, depth, selectable } = row
  const style = { paddingLeft: 8 + depth * 16 }
  if (!selectable) {
    return (
      <li className="builder-bind__row builder-bind__row--group" style={style} role="presentation">
        <Icon name={typeIcon(field.type)} size={13} />
        <span className="builder-bind__row-label">{field.label}</span>
        {field.type === 'relationship' && <span className="builder-bind__row-hop">linked</span>}
      </li>
    )
  }
  const hint = field.path === URL_PATH ? null : sampleHint(sample, field)
  return (
    <li
      ref={active ? scrollIntoView : undefined}
      className="builder-bind__row"
      style={style}
      role="option"
      aria-selected={active}
      data-current={current || undefined}
      onMouseDown={(e) => {
        e.preventDefault()
        onPick(field)
      }}
      onMouseEnter={onHover}
    >
      <span className="builder-bind__row-icon" title={typeLabel(field.type)}>
        <Icon name={fieldIcon(field)} size={13} />
      </span>
      <span className="builder-bind__row-text">
        <span className="builder-bind__row-label">{field.label}</span>
        <code className="builder-bind__row-path">{field.path}</code>
      </span>
      {hint && <span className="builder-bind__row-hint">{hint}</span>}
      {current && <Icon name="check" size={13} className="builder-bind__row-check" />}
    </li>
  )
}

function sampleHint(sample: Record<string, unknown> | null, field: BindingField): string | null {
  if (!sample) return null
  const preview = previewValue(valueAt(sample, field.path), field.type)
  if (preview.kind === 'text') return preview.text
  if (preview.kind === 'image') return 'image'
  return null
}
