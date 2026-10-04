'use client'

import { Button, Collapsible, DraggableSortable, FieldLabel, useDraggableSortable } from '@payloadcms/ui'
import { memo, use, useLayoutEffect, useMemo, useRef } from 'react'
import type { Field } from 'payload'

import { createId } from '../../../core/ids'
import { Icon } from '../icons'
import { RenderBlockFields } from '../renderField'
import { Popover, usePopover } from '../styles/popover'
import { arrayStateKey, cloneRow, fallbackRowLabel, moveItem, toggleId, withRowIds, type ArrayRow } from './arrayRows'
import { ArrayRowContext, asStructuralChange, generatedRowId, getCollapsedRows, setCollapsedRows, useCollapsedRows } from './arrayState'
import { rowLabel, type FieldShape } from './values'

type Props = {
  readonly fields: Field[]
  readonly label: string
  /** The name of one row ("Link"), from the field's `labels.singular`. */
  readonly singular?: string
  readonly description?: string
  readonly maxRows?: number
  readonly path: string
  readonly value: unknown
  /** The whole new list of rows, or `undefined` when the last row was removed. */
  readonly onChange: (value: ArrayRow[] | undefined) => void
}

/** Row edits. Stable for the life of the field, so unchanged rows skip the render. */
type RowActions = {
  change: (id: string, data: Record<string, unknown> | undefined) => void
  move: (from: number, to: number) => void
  addBelow: (index: number) => void
  duplicate: (index: number) => void
  remove: (index: number) => void
  setCollapsed: (id: string, collapsed: boolean) => void
}

/**
 * Payload's array field, without a Form: collapsible rows with a row label, "Collapse all" and
 * "Show all", drag to reorder, and a row menu (move, add below, duplicate, remove). Every edit
 * writes the whole list once, so it is one `update` operation. Collapsed rows are kept per field
 * (see `arrayState.ts`).
 */
export function ArrayField({ fields, label, singular, description, maxRows, path, value, onChange }: Props) {
  const parent = use(ArrayRowContext)
  const stateKey = arrayStateKey(path, parent)
  const rows = withRowIds(value, (index, taken) => generatedRowId(stateKey, index, taken))
  const collapsed = useCollapsedRows(stateKey)
  const full = typeof maxRows === 'number' && rows.length >= maxRows
  const itemLabel = singular || 'Item'

  // The row actions read the latest values from here, so they never change identity.
  const latest = useRef({ rows, onChange, fields, stateKey })
  useLayoutEffect(() => {
    latest.current = { rows, onChange, fields, stateKey }
  })
  const actions = useMemo<RowActions>(() => {
    const commit = (next: readonly ArrayRow[]) => latest.current.onChange(next.length > 0 ? [...next] : undefined)
    // Moves, adds and removes are their own undo step (typing in a row merges as usual).
    const commitRows = (next: readonly ArrayRow[]) => asStructuralChange(() => commit(next))
    const insert = (index: number, row: ArrayRow) => {
      const current = latest.current.rows
      commitRows([...current.slice(0, index), row, ...current.slice(index)])
    }
    return {
      change: (id, data) => commit(latest.current.rows.map((row) => (row.id === id ? { ...data, id } : row))),
      move: (from, to) => {
        const current = latest.current.rows
        const next = moveItem(current, from, to)
        if (next !== current) commitRows(next)
      },
      addBelow: (index) => insert(index + 1, { id: createId() }),
      duplicate: (index) => {
        const row = latest.current.rows[index]
        if (row) insert(index + 1, cloneRow(row, latest.current.fields, createId))
      },
      remove: (index) => commitRows(latest.current.rows.filter((_, i) => i !== index)),
      setCollapsed: (id, on) => {
        const key = latest.current.stateKey
        setCollapsedRows(key, toggleId(getCollapsedRows(key), id, on))
      },
    }
  }, [])

  const ids = rows.map((row) => row.id)
  return (
    <div className="builder-field-array">
      <div className="builder-field-array__head">
        <FieldLabel label={label} path={path} />
        {rows.length > 0 && (
          <div className="builder-field-array__head-actions">
            <button type="button" onClick={() => setCollapsedRows(stateKey, new Set(ids))}>
              Collapse all
            </button>
            <button type="button" onClick={() => setCollapsedRows(stateKey, new Set())}>
              Show all
            </button>
          </div>
        )}
      </div>
      {description && <p className="builder-field-group__description">{description}</p>}
      {rows.length > 0 && (
        <DraggableSortable
          className="builder-field-array__rows"
          ids={ids}
          onDragEnd={({ moveFromIndex, moveToIndex }) => actions.move(moveFromIndex, moveToIndex)}
        >
          {rows.map((row, index) => (
            <ArrayFieldRow
              key={row.id}
              actions={actions}
              collapsed={collapsed.has(row.id)}
              fields={fields}
              full={full}
              index={index}
              itemLabel={itemLabel}
              path={path}
              row={row}
              rowCount={rows.length}
              stateKey={stateKey}
            />
          ))}
        </DraggableSortable>
      )}
      <Button
        buttonStyle="secondary"
        disabled={full}
        icon="plus"
        iconPosition="left"
        iconStyle="with-border"
        margin={false}
        onClick={() => actions.addBelow(rows.length - 1)}
        size="small"
      >
        {singular ? `Add ${singular}` : 'Add item'}
      </Button>
    </div>
  )
}

type RowProps = {
  readonly actions: RowActions
  readonly collapsed: boolean
  readonly fields: Field[]
  readonly full: boolean
  readonly index: number
  readonly itemLabel: string
  /** The array field's path. The row's path is `${path}.${index}`. */
  readonly path: string
  readonly row: ArrayRow
  readonly rowCount: number
  readonly stateKey: string
}

/** One row. Memoized: typing in one row does not re-render the others. */
const ArrayFieldRow = memo(function ArrayFieldRow({
  actions,
  collapsed,
  fields,
  full,
  index,
  itemLabel,
  path,
  row,
  rowCount,
  stateKey,
}: RowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useDraggableSortable({ id: row.id })
  const rowPath = `${path}.${index}`
  const rowKey = `${stateKey}.${row.id}`
  const context = useMemo(() => ({ rowPath, rowKey }), [rowPath, rowKey])
  const title = rowLabel(row, fields as FieldShape[]) ?? fallbackRowLabel(itemLabel, index)

  return (
    <div
      ref={setNodeRef}
      className="builder-field-array__row"
      data-dragging={isDragging || undefined}
      style={{ transform, transition, zIndex: isDragging ? 1 : undefined }}
    >
      <Collapsible
        actions={<RowMenu actions={actions} full={full} index={index} rowCount={rowCount} />}
        className="builder-field-array__collapsible"
        dragHandleProps={{ id: row.id, attributes: attributes as never, listeners }}
        header={<span className="builder-field-array__title">{title}</span>}
        isCollapsed={collapsed}
        onToggle={(next) => actions.setCollapsed(row.id, next)}
      >
        {/* Collapsed rows render no inputs: fewer components, and no uploads or relationships to load. */}
        {!collapsed && (
          <ArrayRowContext value={context}>
            <div className="builder-field-array__fields">
              <RenderBlockFields fields={fields} data={row} path={rowPath} onChange={(next) => actions.change(row.id, next)} />
            </div>
          </ArrayRowContext>
        )}
      </Collapsible>
    </div>
  )
})

function RowMenu({
  actions,
  full,
  index,
  rowCount,
}: {
  readonly actions: RowActions
  readonly full: boolean
  readonly index: number
  readonly rowCount: number
}) {
  const menu = usePopover('auto')
  const item = (icon: Parameters<typeof Icon>[0]['name'], text: string, run: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={`builder-editor__menu-item${danger ? ' builder-editor__menu-item--danger' : ''}`}
      onClick={() => {
        menu.hide()
        run()
      }}
    >
      <Icon name={icon} size={14} />
      {text}
    </button>
  )
  return (
    <>
      <button
        type="button"
        className="builder-field-array__menu-button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        data-tooltip="Row actions"
        onClick={(e) => menu.toggle(e.currentTarget)}
      >
        <Icon name="more" size={14} />
      </button>
      <Popover {...menu.props} className="builder-editor__menu" label="Row actions">
        <div role="menu">
          {index > 0 && item('up', 'Move up', () => actions.move(index, index - 1))}
          {index < rowCount - 1 && item('down', 'Move down', () => actions.move(index, index + 1))}
          {!full && item('plus', 'Add below', () => actions.addBelow(index))}
          {!full && item('duplicate', 'Duplicate', () => actions.duplicate(index))}
          {item('delete', 'Remove', () => actions.remove(index), true)}
        </div>
      </Popover>
    </>
  )
}
