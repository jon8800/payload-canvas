// The changes between two versions of a layout, in plain words, for Payload's Versions > compare
// view. Pure functions: no React, no Payload runtime, so they are unit tested.
//
// Blocks are matched by id. A block in the newer layout only is "added", in the older one only
// "removed" (only the outermost such block is listed; its children are counted). A block with a
// new parent or slot is "moved"; within one list, only the blocks that left the common order are
// "moved" (longest common subsequence), so one insert does not list every sibling after it.
// A block whose own data differs is "changed", with one line per changed prop, style or setting.

import { dataFields, type LooseField } from '../../core/fields'
import { richTextToPlain, isRichText } from '../../core/bindings'
import { isPlainObject, normalizeLayout } from '../../core/tree'
import type { Block, BlockDefinition, BlockProps } from '../../core/types'
import { blockSummary } from '../editor/names'

/** Longest value text in a change line, in characters. */
const VALUE_MAX = 80

/** One changed setting of a block. */
export type LayoutChangeDetail =
  | {
      kind: 'value'
      /** What changed, e.g. "Quote", "Name", "Visibility", "Binding of Text". */
      label: string
      /** Old and new value as short plain text. Empty means "no value". */
      from: string
      to: string
      /** Set when a translation changed: the locale code. */
      locale?: string
    }
  | { kind: 'classes'; added: string[]; removed: string[] }
  /** A change without readable values, e.g. "Animation changed" or "Formatting changed". */
  | { kind: 'note'; label: string; text: string; locale?: string }

export type LayoutChange =
  | {
      kind: 'added' | 'removed'
      id: string
      /** The block's name, as the editor's outline shows it. */
      name: string
      /** The parent's name (with the slot when the parent has more than one). Undefined at the top level. */
      where?: string
      /** Blocks inside the added or removed block. */
      inside: number
    }
  | {
      kind: 'moved'
      id: string
      name: string
      /** Old and new place, e.g. "Section · Hero" or "top level", with the position when it helps. */
      from: string
      to: string
    }
  | { kind: 'changed'; id: string; name: string; details: LayoutChangeDetail[] }

export type LayoutDiffOptions = {
  /** Block definitions: type labels, prop labels, slot labels. */
  blocks: readonly BlockDefinition[]
  /**
   * Translations to compare (`block.locales`). Undefined compares every locale; an empty list
   * compares none.
   */
  locales?: readonly string[]
}

type Place = {
  block: Block
  parent: Block | null
  slot: string
  index: number
}

/** Every block of a layout by id, with its parent, slot and index. */
function indexLayout(blocks: Block[]): Map<string, Place> {
  const out = new Map<string, Place>()
  const visit = (list: Block[], parent: Block | null, slot: string) => {
    list.forEach((block, index) => {
      out.set(block.id, { block, parent, slot, index })
      for (const [name, children] of Object.entries(block.slots ?? {})) visit(children, block, name)
    })
  }
  visit(blocks, null, 'children')
  return out
}

function countInside(block: Block): number {
  let count = 0
  for (const children of Object.values(block.slots ?? {})) for (const child of children) count += 1 + countInside(child)
  return count
}

/** Deep equality for JSON data. Key order does not matter. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => sameValue(item, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) if (!sameValue(a[key], b[key])) return false
    return true
  }
  return false
}

/** Cuts a text to `max` characters with an ellipsis, on one line. */
export function clipText(text: string, max = VALUE_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** "backgroundImage" → "Background image". */
function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : key
}

/** A field label as text: a string, or the first translation of a label object. */
function labelText(label: unknown, fallback: string): string {
  if (typeof label === 'string' && label.trim()) return label
  if (isPlainObject(label)) {
    const first = Object.values(label).find((value) => typeof value === 'string' && value.trim())
    if (typeof first === 'string') return first
  }
  return humanize(fallback)
}

function optionLabel(field: LooseField | undefined, value: unknown): string | undefined {
  if (!field?.options) return undefined
  for (const option of field.options) {
    if (isPlainObject(option) && option.value === value) return labelText(option.label, String(value))
  }
  return undefined
}

/** A prop value as short plain text. Rich text loses its formatting. */
export function valueText(value: unknown, field?: LooseField): string {
  if (value === undefined || value === null || value === '') return ''
  const option = optionLabel(field, value)
  if (option) return option
  // Relationship and upload props store document ids.
  if ((field?.type === 'upload' || field?.type === 'relationship') && !isPlainObject(value)) {
    return Array.isArray(value) ? clipText(value.map((v) => `#${String(v)}`).join(', ')) : `#${String(value)}`
  }
  if (typeof value === 'string') return clipText(value)
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (isRichText(value)) return clipText(richTextToPlain(value))
  if (Array.isArray(value)) return clipText(value.map((item) => valueText(item, field)).filter(Boolean).join(', '))
  if (isPlainObject(value)) {
    // Links show their address or target; other groups a compact JSON.
    if (typeof value.url === 'string' && value.url) return clipText(value.url)
    if (isPlainObject(value.reference) && value.reference.value !== undefined) {
      return `#${String(value.reference.value)}`
    }
    return clipText(JSON.stringify(value))
  }
  return clipText(String(value))
}

/** Changed values of two prop objects, one detail per key. */
function propDetails(
  from: BlockProps | undefined,
  to: BlockProps | undefined,
  fields: DataFieldLookup,
  locale?: string,
): LayoutChangeDetail[] {
  const a = from ?? {}
  const b = to ?? {}
  const out: LayoutChangeDetail[] = []
  for (const key of orderedKeys(a, b, fields)) {
    if (sameValue(a[key], b[key])) continue
    const field = fields.get(key)
    const label = labelText(field?.label, key)
    const before = valueText(a[key], field)
    const after = valueText(b[key], field)
    if (before === after) {
      out.push({ kind: 'note', label, text: 'Formatting or details changed', ...(locale ? { locale } : {}) })
      continue
    }
    out.push({ kind: 'value', label, from: before, to: after, ...(locale ? { locale } : {}) })
  }
  return out
}

type DataFieldLookup = Map<string, LooseField>

/** Prop keys in the order of the block's fields, then any unknown keys. */
function orderedKeys(a: BlockProps, b: BlockProps, fields: DataFieldLookup): string[] {
  const all = new Set([...Object.keys(a), ...Object.keys(b)])
  const known = [...fields.keys()].filter((key) => all.has(key))
  return [...known, ...[...all].filter((key) => !fields.has(key))]
}

function splitClasses(value: string | undefined): string[] {
  return (value ?? '').split(/\s+/).filter(Boolean)
}

function motionNote(from: unknown, to: unknown): string {
  if (!from) return 'Animation added'
  if (!to) return 'Animation removed'
  return 'Animation changed'
}

type Context = {
  defs: Map<string, BlockDefinition>
  fieldCache: Map<string, DataFieldLookup>
  locales?: ReadonlySet<string>
}

function typeLabel(ctx: Context, type: string): string {
  return ctx.defs.get(type)?.label ?? humanize(type)
}

function fieldsOf(ctx: Context, type: string): DataFieldLookup {
  let lookup = ctx.fieldCache.get(type)
  if (!lookup) {
    lookup = new Map(dataFields(ctx.defs.get(type)?.fields).map((field) => [field.name, field]))
    ctx.fieldCache.set(type, lookup)
  }
  return lookup
}

function nameOf(ctx: Context, block: Block): string {
  return blockSummary(block, typeLabel(ctx, block.type))
}

/** "Section · Hero", or "Grid · Items" when the parent has more than one slot. Undefined at the top. */
function whereOf(ctx: Context, place: Place): string | undefined {
  if (!place.parent) return undefined
  const name = nameOf(ctx, place.parent)
  const slots = ctx.defs.get(place.parent.type)?.slots
  if (!slots || Object.keys(slots).length < 2) return name
  return `${name} › ${slots[place.slot]?.label ?? humanize(place.slot)}`
}

function blockDetails(ctx: Context, from: Block, to: Block): LayoutChangeDetail[] {
  const out: LayoutChangeDetail[] = []
  if (from.type !== to.type) {
    out.push({ kind: 'value', label: 'Block type', from: typeLabel(ctx, from.type), to: typeLabel(ctx, to.type) })
  }
  if ((from.label ?? '') !== (to.label ?? '')) {
    out.push({ kind: 'value', label: 'Name', from: from.label ?? '', to: to.label ?? '' })
  }
  if (Boolean(from.hidden) !== Boolean(to.hidden)) {
    out.push({ kind: 'value', label: 'Visibility', from: from.hidden ? 'Hidden' : 'Shown', to: to.hidden ? 'Hidden' : 'Shown' })
  }
  const fields = fieldsOf(ctx, to.type)
  out.push(...propDetails(from.props, to.props, fields))
  const locales = new Set([...Object.keys(from.locales ?? {}), ...Object.keys(to.locales ?? {})])
  for (const locale of locales) {
    if (ctx.locales && !ctx.locales.has(locale)) continue
    out.push(...propDetails(from.locales?.[locale], to.locales?.[locale], fields, locale))
  }
  const oldClasses = splitClasses(from.className)
  const newClasses = splitClasses(to.className)
  const added = newClasses.filter((c) => !oldClasses.includes(c))
  const removed = oldClasses.filter((c) => !newClasses.includes(c))
  if (added.length > 0 || removed.length > 0) out.push({ kind: 'classes', added, removed })
  const bindings = new Set([...Object.keys(from.bindings ?? {}), ...Object.keys(to.bindings ?? {})])
  for (const key of bindings) {
    const before = from.bindings?.[key] ?? ''
    const after = to.bindings?.[key] ?? ''
    if (before === after) continue
    const label = `Binding of ${labelText(fields.get(key)?.label, key)}`
    out.push({ kind: 'value', label, from: before ? `{${before}}` : '', to: after ? `{${after}}` : '' })
  }
  if (!sameValue(from.motion, to.motion)) out.push({ kind: 'note', label: 'Animation', text: motionNote(from.motion, to.motion) })
  return out
}

/** Ids of `list` that keep their relative order (longest common subsequence with `other`). */
function stableIds(list: string[], other: string[]): Set<string> {
  const n = list.length
  const m = other.length
  const table: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = list[i] === other[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const keep = new Set<string>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (list[i] === other[j]) {
      keep.add(list[i])
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) i++
    else j++
  }
  return keep
}

function sameSlot(a: Place, b: Place): boolean {
  return (a.parent?.id ?? null) === (b.parent?.id ?? null) && a.slot === b.slot
}

/** The ids of one slot's list that sit in the same slot in the other layout too. */
function stayingIds(list: Block[], other: Map<string, Place>, place: Place): string[] {
  return list.map((b) => b.id).filter((id) => {
    const there = other.get(id)
    return there !== undefined && sameSlot(there, place)
  })
}

function listOf(layout: Block[], place: Place): Block[] {
  return place.parent ? (place.parent.slots?.[place.slot] ?? []) : layout
}

/** Old and new place of a moved block, in words. */
function movePlaces(ctx: Context, before: Place, after: Place, sameList: boolean): { from: string; to: string } {
  if (sameList) {
    const where = whereOf(ctx, after)
    const suffix = where ? ` in ${where}` : ''
    return { from: `position ${before.index + 1}${suffix}`, to: `position ${after.index + 1}${suffix}` }
  }
  return { from: whereOf(ctx, before) ?? 'top level', to: whereOf(ctx, after) ?? 'top level' }
}

/**
 * The changes from `from` (the older version) to `to` (the newer one), in the newer layout's
 * order; removed blocks come last. Any stored value is accepted: both are normalized first.
 */
export function diffLayouts(from: unknown, to: unknown, options: LayoutDiffOptions): LayoutChange[] {
  const ctx: Context = {
    defs: new Map(options.blocks.map((def) => [def.type, def])),
    fieldCache: new Map(),
    ...(options.locales ? { locales: new Set(options.locales) } : {}),
  }
  const oldBlocks = normalizeLayout(from).blocks
  const newBlocks = normalizeLayout(to).blocks
  const oldIndex = indexLayout(oldBlocks)
  const newIndex = indexLayout(newBlocks)
  const out: LayoutChange[] = []

  // Blocks that stayed in their list but left the common order of that list.
  const reordered = new Set<string>()
  const checkedLists = new Set<string>()
  for (const [id, after] of newIndex) {
    const before = oldIndex.get(id)
    if (!before) continue
    if (!sameSlot(before, after)) continue
    const key = `${after.parent?.id ?? ''}\u0000${after.slot}`
    if (checkedLists.has(key)) continue
    checkedLists.add(key)
    const newList = stayingIds(listOf(newBlocks, after), oldIndex, after)
    const oldList = stayingIds(listOf(oldBlocks, before), newIndex, before)
    const stable = stableIds(newList, oldList)
    for (const shared of newList) if (!stable.has(shared)) reordered.add(shared)
  }

  const visit = (list: Block[]) => {
    for (const block of list) {
      const after = newIndex.get(block.id)
      const before = oldIndex.get(block.id)
      if (!after) continue
      if (!before) {
        // Only the outermost added block is listed.
        if (!after.parent || oldIndex.has(after.parent.id)) {
          const where = whereOf(ctx, after)
          out.push({ kind: 'added', id: block.id, name: nameOf(ctx, block), ...(where ? { where } : {}), inside: countInside(block) })
        }
        continue
      }
      const sameList = sameSlot(before, after)
      if (!sameList || reordered.has(block.id)) {
        out.push({ kind: 'moved', id: block.id, name: nameOf(ctx, block), ...movePlaces(ctx, before, after, sameList) })
      }
      const details = blockDetails(ctx, before.block, block)
      if (details.length > 0) out.push({ kind: 'changed', id: block.id, name: nameOf(ctx, block), details })
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  visit(newBlocks)

  for (const [id, before] of oldIndex) {
    if (newIndex.has(id)) continue
    // Only the outermost removed block is listed.
    if (before.parent && !newIndex.has(before.parent.id)) continue
    const where = whereOf(ctx, before)
    out.push({ kind: 'removed', id, name: nameOf(ctx, before.block), ...(where ? { where } : {}), inside: countInside(before.block) })
  }
  return out
}

/** "3 changes: 1 added, 1 removed, 1 changed". "No changes to the layout" when the list is empty. */
export function summarizeLayoutChanges(changes: readonly LayoutChange[]): string {
  if (changes.length === 0) return 'No changes to the layout'
  const counts: Record<LayoutChange['kind'], number> = { added: 0, removed: 0, moved: 0, changed: 0 }
  for (const change of changes) counts[change.kind]++
  const parts = (['added', 'removed', 'moved', 'changed'] as const).filter((kind) => counts[kind] > 0).map((kind) => `${counts[kind]} ${kind}`)
  const total = changes.length
  return `${total} ${total === 1 ? 'change' : 'changes'}: ${parts.join(', ')}`
}
