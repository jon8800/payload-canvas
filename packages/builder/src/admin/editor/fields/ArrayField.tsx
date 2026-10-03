'use client'

import { Button, FieldLabel } from '@payloadcms/ui'
import { useState } from 'react'
import type { Field } from 'payload'

import { createId } from '../../../core/ids'
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, TrashIcon } from '../icons'
import { RenderBlockFields } from '../renderField'
import { isRecord, rowLabel, type FieldShape } from './values'

type Row = Record<string, unknown> & { id?: string }

type Props = {
  readonly fields: Field[]
  readonly label: string
  readonly description?: string
  readonly maxRows?: number
  readonly path: string
  readonly value: unknown
  /** The whole new list of rows, or `undefined` when the last row was removed. */
  readonly onChange: (value: Row[] | undefined) => void
}

type RowWithId = Row & { id: string }

const hasId = (row: Row): row is RowWithId => typeof row.id === 'string' && row.id !== ''

/** Rows that can be added, removed, duplicated, moved and collapsed. Each row edits one object. */
export function ArrayField({ fields, label, description, maxRows, path, value, onChange }: Props) {
  // Rows written by hand (seed data, AI) may have no id. They get one here, kept per index until
  // the next edit stores it, so the React key (and the focused input) stays the same.
  const [generated] = useState(() => new Map<number, string>())
  const rows: RowWithId[] = (Array.isArray(value) ? value.filter(isRecord) : []).map((row, index) => {
    if (hasId(row)) return row
    if (!generated.has(index)) generated.set(index, createId())
    return { ...row, id: generated.get(index)! }
  })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const full = typeof maxRows === 'number' && rows.length >= maxRows

  const commit = (next: Row[]) => onChange(next.length > 0 ? next : undefined)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row!)
    commit(next)
  }
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="builder-field-array">
      <FieldLabel label={label} path={path} />
      {description && <p className="builder-field-group__description">{description}</p>}
      {rows.length > 0 && (
        <ol className="builder-field-array__rows">
          {rows.map((row, index) => {
            const id = row.id
            const isCollapsed = collapsed.has(id)
            return (
              <li key={id} className="builder-field-array__row">
                <div className="builder-field-array__header">
                  <button
                    type="button"
                    className="builder-field-array__toggle"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggle(id)}
                  >
                    <span className="builder-field-array__chevron" aria-hidden="true" data-collapsed={isCollapsed} />
                    <span className="builder-field-array__title">
                      {rowLabel(row, fields as FieldShape[]) ?? `Item ${String(index + 1).padStart(2, '0')}`}
                    </span>
                  </button>
                  <div className="builder-field-array__actions">
                    <button type="button" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowUpIcon size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      title="Move down"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDownIcon size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Duplicate"
                      title="Duplicate"
                      disabled={full}
                      onClick={() => commit([...rows.slice(0, index + 1), { ...structuredClone(row), id: createId() }, ...rows.slice(index + 1)])}
                    >
                      <CopyIcon size={14} />
                    </button>
                    <button type="button" aria-label="Remove" title="Remove" onClick={() => commit(rows.filter((r) => r.id !== id))}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="builder-field-array__fields">
                    <RenderBlockFields
                      fields={fields}
                      data={row}
                      path={`${path}.${index}`}
                      // A row keeps its id even when all its fields are empty.
                      onChange={(next) => commit(rows.map((r) => (r.id === id ? { ...next, id } : r)))}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <Button buttonStyle="secondary" disabled={full} icon="plus" iconPosition="left" iconStyle="with-border" margin={false} onClick={() => commit([...rows, { id: createId() }])} size="small">
        Add item
      </Button>
    </div>
  )
}
