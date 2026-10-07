'use client'

// Field access of block props in the inspector. The server checks each prop's `access.read` and
// `access.update` for this user when the builder opens (`meta.fieldAccess`) and again after edits
// to blocks with access rules (their data may change the answer). The inspector hides props the
// user may not read and locks props the user may not change. The values stay in the layout: the
// inputs never write them. The server refuses such edits anyway (403).

import { createContext, useContext, useEffect, type ReactNode } from 'react'

import { propAccessAt, propAccessRuleOf, type PropAccessRule } from '../../../core/fieldAccess'
import { walkBlocks } from '../../../core/tree'
import type { Block, Layout } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useValueSelector } from '../valueStore'
import { LOCKED_HINT } from './accessRules'

/** Wait after the last change to a block with access rules before asking the server again. */
const REFRESH_DELAY_MS = 800


/** The access rule of one block for the current user. Undefined: no rules, everything is open. */
export function useBlockAccessRule(block: Block): PropAccessRule | undefined {
  const runtime = useRuntime()
  return useValueSelector(runtime.doc.meta, (meta) => propAccessRuleOf(meta.fieldAccess, block.id, block.type))
}

type AccessContextValue = { rule: PropAccessRule | undefined; prefix: string }

const AccessContext = createContext<AccessContextValue>({ rule: undefined, prefix: '' })

/** Gives the inspector fields of one block its rule. `prefix` is the inspector path of the block's props. */
export function FieldAccessProvider({ block, prefix, children }: { block: Block; prefix: string; children: ReactNode }) {
  const rule = useBlockAccessRule(block)
  return <AccessContext value={{ rule, prefix }}>{children}</AccessContext>
}

const OPEN = { read: true, update: true }

/** A function that tells what the user may do with the field at an inspector path (`builder.<id>.items.1.label`). */
export function useFieldAccessCheck(): (path: string) => { read: boolean; update: boolean } {
  const { rule, prefix } = useContext(AccessContext)
  return (path) => (rule && prefix && path.startsWith(prefix) ? propAccessAt(rule, path.slice(prefix.length)) : OPEN)
}

/**
 * With `locked`: a field the user may read but not change. A small lock with a tooltip, and the
 * input inert (no clicks, no typing, no focus). Without it the field renders as it is.
 */
export function FieldAccessFrame({ locked, children }: { locked: boolean; children: ReactNode }) {
  if (!locked) return children
  return (
    <div className="builder-field-locked" data-locked="">
      <span className="builder-field-locked__badge" data-tooltip={LOCKED_HINT}>
        <Icon name="lock" size={12} />
        <span className="builder-field-locked__text">{LOCKED_HINT}</span>
      </span>
      <div className="builder-field-locked__body" inert>
        {children}
      </div>
    </div>
  )
}

/** How many top-level props of the block the user may not read. */
export function useHiddenCount(block: Block): number {
  const rule = useBlockAccessRule(block)
  return (rule?.read ?? []).filter((path) => !path.includes('.')).length
}

/** A line under the fields when some are hidden from this user. */
export function HiddenFieldsNote({ block }: { block: Block }) {
  const count = useHiddenCount(block)
  if (count === 0) return null
  return (
    <p className="builder-editor__hint builder-field-hidden-note">
      <Icon name="lock" size={12} /> {count === 1 ? '1 field is hidden' : `${count} fields are hidden`}. You do not have permission to see{' '}
      {count === 1 ? 'it' : 'them'}.
    </p>
  )
}

/** The props of every block of the given types, as one string, to notice a change that matters. */
function accessSignature(layout: Layout, types: ReadonlySet<string>): string {
  const parts: string[] = []
  walkBlocks(layout, (block) => {
    if (types.has(block.type)) parts.push(`${block.id}:${JSON.stringify(block.props ?? null)}`)
  })
  return parts.join('\n')
}

/**
 * Mounted once in the editor. Asks the server again for the prop access when a block with access
 * rules was added, removed or changed (by anyone), 800 ms after the last such change. New blocks
 * use their type's rule until the answer comes.
 */
export function useAccessRefresh(): void {
  const runtime = useRuntime()
  useEffect(() => {
    const { store, doc } = runtime
    const types = () => new Set(Object.keys(doc.meta.get().fieldAccess?.types ?? {}))
    if (types().size === 0) return
    let last = accessSignature(store.getState().layout, types())
    let timer: ReturnType<typeof setTimeout> | undefined
    let seen = store.getState().layout
    const unsubscribe = store.subscribe(() => {
      const { layout } = store.getState()
      if (layout === seen) return
      seen = layout
      const next = accessSignature(layout, types())
      if (next === last) return
      last = next
      clearTimeout(timer)
      timer = setTimeout(() => void doc.refreshAccess(), REFRESH_DELAY_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [runtime])
}
