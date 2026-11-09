'use client'

// The fields of a panel region (`panel: true`, for example a form's settings), edited in the
// inspector with the same Payload inputs as block props. Each change saves to the document
// through the regions controller (one undo step per save). Typing waits for a short pause, or
// for the focus to leave the field, so a sentence is one save, not one per key. A change that
// shows a required field (choosing "Redirect" shows "Document to link to") waits until that field
// has a value, then both save together: Payload would refuse the first one alone.

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'
import type { Field } from 'payload'

import { setDocPath, valueAtDocPath } from '../../../core/regions'
import type { RegionConfig } from '../../../core/types'
import { FieldAccessFrame } from '../fields/access'
import { RenderBlockFields, undoKeysHandler } from '../renderField'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import type { RegionsController } from './controller'
import { missingRequired } from './required'

/** How long typing pauses before the change saves. */
const SAVE_DELAY_MS = 700

const parentPath = (path: string) => path.split('.').slice(0, -1).join('.')

/** The values with the unsaved changes on top. */
function withChanges(values: Record<string, unknown>, changes: Record<string, unknown>): Record<string, unknown> {
  let data = values
  for (const [path, value] of Object.entries(changes)) {
    const next = setDocPath(data, path, value)
    if (next.ok) data = next.value
  }
  return data
}

/** The required fields of the region that show and are empty in `data`. */
function emptyRequired(region: RegionConfig, data: Record<string, unknown>): string[] {
  const parents = [...new Set(region.fields.map((f) => parentPath(f.path)))]
  return parents.flatMap((parent) => {
    const fields = region.fields.filter((f) => parentPath(f.path) === parent).map((f) => f.field as never)
    return missingRequired(fields, parent ? valueAtDocPath(data, parent) : data)
  })
}

export function RegionFields({ regions, region }: { regions: RegionsController; region: RegionConfig }) {
  const runtime = useRuntime()
  const state = useValue(regions.state)
  // Changes not saved yet, by document path. They show at once; the save follows after a pause.
  const [pending, setPending] = useState<Record<string, unknown>>({})
  const pendingRef = useRef(pending)
  const timer = useRef<number | null>(null)
  // Required fields a change showed and that are still empty: the change waits for them.
  const [waiting, setWaiting] = useState<string[]>([])
  const valuesRef = useRef(state.values)

  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const changes = Object.entries(pendingRef.current)
    if (changes.length === 0) return
    const stored = valuesRef.current ?? {}
    const before = new Set(emptyRequired(region, stored))
    const missing = emptyRequired(region, withChanges(stored, pendingRef.current)).filter((label) => !before.has(label))
    setWaiting(missing)
    if (missing.length > 0) return
    void regions.write(changes.map(([path, value]) => ({ path, value }))).finally(() => {
      // Keep only what changed again while this save ran.
      setPending((current) => Object.fromEntries(Object.entries(current).filter(([path, value]) => !changes.some(([p, v]) => p === path && v === value))))
    })
  }
  // Leaving the panel (a block selected, the editor closed) saves what is left, or says why not.
  const leave = useRef(() => {})
  // The timer, the blur and the unmount read the latest values through these refs.
  useLayoutEffect(() => {
    pendingRef.current = pending
    valuesRef.current = state.values
    leave.current = () => {
      flush()
      if (Object.keys(pendingRef.current).length > 0) runtime.warn(`${region.label}: not saved. Fill in the required fields first.`)
    }
  })
  useEffect(() => () => leave.current(), [])

  if (state.status === 'loading' && !state.values) return <p className="builder-editor__hint">Loading the fields…</p>
  if (!state.values) return null

  // The document values with the unsaved changes on top.
  const data = withChanges(state.values, pending)

  const change = (path: string, value: unknown) => {
    setPending((current) => ({ ...current, [path]: value ?? null }))
    pendingRef.current = { ...pendingRef.current, [path]: value ?? null }
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  // Fields that share a parent object see each other as siblings (conditions, defaults).
  const scopeOf = (path: string): Field[] => region.fields.filter((f) => parentPath(f.path) === parentPath(path)).map((f) => f.field as unknown as Field)

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    flush()
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- saves on leaving the fields and delegates the undo keys of the inputs inside
    <div className="builder-editor__fields" onBlur={onBlur} onKeyDown={undoKeysHandler(runtime)}>
      {waiting.length > 0 && Object.keys(pending).length > 0 && (
        <output className="builder-editor__hint">Not saved yet. Fill in {waiting.join(', ')} to save.</output>
      )}
      {region.fields.map((field) => {
        const parent = parentPath(field.path)
        const siblings = parent ? valueAtDocPath(data, parent) : data
        const name = field.path.split('.').at(-1) as string
        const locked = regions.lockedMessage(field.path) !== null && state.access !== null
        return (
          <FieldAccessFrame key={field.path} locked={locked}>
            <RenderBlockFields
              fields={[field.field as unknown as Field]}
              scope={scopeOf(field.path)}
              data={siblings}
              path={`region.${region.name}${parent ? `.${parent}` : ''}`}
              onChange={(next) => change(field.path, next?.[name])}
            />
          </FieldAccessFrame>
        )
      })}
    </div>
  )
}
