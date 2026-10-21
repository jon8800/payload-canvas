import { dataFields, type DataField } from './fields'
import { isPlainObject, walkBlocks } from './tree'
import type { BlockDefinition, Layout } from './types'

/**
 * The block's top-level text props that hold Tailwind classes: fields with
 * `admin: { custom: { builderClasses: true } }`, for example a carousel's `arrowClassName`.
 * The save hook and the canvas compile their values (and their `defaultValue`) like `className`.
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
 * Every distinct class the layout needs, sorted: each block's `className` and `slotClassName` (hidden blocks too),
 * plus, when `blocks` is given, `BlockDefinition.classes` of every block type in the layout and the
 * values of its class props (`classFields`) in every locale, with their defaults.
 */
export function collectClasses(layout: Layout, blocks?: readonly BlockDefinition[]): string[] {
  const classes = new Set<string>()
  const types = new Set<string>()
  const propsOf = new Map((blocks ?? []).map((def) => [def.type, classFields(def)]))
  walkBlocks(layout, (block) => {
    types.add(block.type)
    if (typeof block.className === 'string') addClasses(classes, block.className)
    for (const value of Object.values(block.slotClassName ?? {})) if (typeof value === 'string') addClasses(classes, value)
    for (const field of propsOf.get(block.type) ?? []) {
      for (const values of [block.props, ...Object.values(block.locales ?? {})]) {
        const value = values?.[field.name]
        if (typeof value === 'string') addClasses(classes, value)
      }
    }
  })
  for (const definition of blocks ?? []) {
    if (!types.has(definition.type)) continue
    for (const value of definition.classes ?? []) {
      if (typeof value === 'string') addClasses(classes, value)
    }
    for (const field of propsOf.get(definition.type) ?? []) {
      const fallback = (field as { defaultValue?: unknown }).defaultValue
      if (typeof fallback === 'string') addClasses(classes, fallback)
    }
  }
  return [...classes].toSorted()
}
