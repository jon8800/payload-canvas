import { dataFields, type DataField } from './fields'
import { isPlainObject, walkBlocks } from './tree'
import type { BlockDefinition, Layout } from './types'

/** One inner element of a block that takes classes of its own (`block.partClassName[name]`). */
export type BlockPart = {
  name: string
  label: string
  /** True for a slot with `styles: true`, false for an entry of `BlockDefinition.parts`. */
  slot: boolean
  defaultClassName?: string
}

/**
 * The block's parts: its slots with `styles: true` (in slot order), then its `parts`. A part name
 * that is also a slot name is left out of `parts`.
 */
export function blockParts(def: Pick<BlockDefinition, 'slots' | 'parts'> | undefined): BlockPart[] {
  const slots = Object.entries(def?.slots ?? {})
  const fromSlots = slots
    .filter(([, slot]) => slot.styles)
    .map(([name, slot]): BlockPart => ({
      name,
      label: slot.label?.trim() || name,
      slot: true,
      ...(slot.defaultClassName ? { defaultClassName: slot.defaultClassName } : {}),
    }))
  const fromParts = Object.entries(def?.parts ?? {})
    .filter(([name]) => !def?.slots?.[name])
    .map(([name, part]): BlockPart => ({
      name,
      label: part.label.trim() || name,
      slot: false,
      ...(part.defaultClassName ? { defaultClassName: part.defaultClassName } : {}),
    }))
  return [...fromSlots, ...fromParts]
}

/** The `partClassName` a newly inserted block starts with: each part's `defaultClassName`. Null without one. */
export function defaultPartClassNames(def: Pick<BlockDefinition, 'slots' | 'parts'> | undefined): Record<string, string> | null {
  const entries = blockParts(def).flatMap((part) => (part.defaultClassName ? [[part.name, part.defaultClassName] as const] : []))
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/**
 * The block's top-level text props that hold Tailwind classes: fields with
 * `admin: { custom: { builderClasses: true } }`, for example the button's `iconClassName`. The save
 * hook and the canvas compile their values (and their `defaultValue`) like `className`. For new
 * blocks, prefer `BlockDefinition.parts`: a part's classes are edited in the Styles panel.
 */
export function classFields(def: Pick<BlockDefinition, 'fields'> | undefined): DataField[] {
  return dataFields(def?.fields as unknown[] | undefined).filter((field) => {
    const admin = (field as { admin?: unknown }).admin
    return field.type === 'text' && isPlainObject(admin) && isPlainObject(admin.custom) && admin.custom.builderClasses === true
  })
}

function addClasses(target: Set<string>, value: string): void {
  for (const name of value.split(/\s+/)) {
    if (name) target.add(name)
  }
}

/**
 * Every distinct class the layout needs, sorted: each block's `className` and `partClassName`
 * (hidden blocks too), plus, when `blocks` is given, `BlockDefinition.classes` of every block type
 * in the layout and the values of its class props (`classFields`) in every locale, with their defaults.
 */
export function collectClasses(layout: Layout, blocks?: readonly BlockDefinition[]): string[] {
  const classes = new Set<string>()
  const types = new Set<string>()
  const propsOf = new Map((blocks ?? []).map((def) => [def.type, classFields(def)]))
  walkBlocks(layout, (block) => {
    types.add(block.type)
    if (typeof block.className === 'string') addClasses(classes, block.className)
    for (const value of Object.values(block.partClassName ?? {})) if (typeof value === 'string') addClasses(classes, value)
    for (const field of propsOf.get(block.type) ?? []) {
      const fallback = (field as { defaultValue?: unknown }).defaultValue
      const stored = [block.props, ...Object.values(block.locales ?? {})].map((values) => values?.[field.name])
      for (const value of [...stored, fallback]) if (typeof value === 'string') addClasses(classes, value)
    }
  })
  for (const definition of blocks ?? []) {
    if (!types.has(definition.type)) continue
    for (const value of definition.classes ?? []) {
      if (typeof value === 'string') addClasses(classes, value)
    }
  }
  return [...classes].toSorted()
}
