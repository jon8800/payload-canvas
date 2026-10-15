// The builder's storage codec for a Payload `blocks` field: one source of truth.
//
// A collection whose builder field is a Payload `blocks` field keeps that field as it is. Payload's
// editor, hooks, validation, access and versions work on it as before. The builder reads the same
// value into a layout while a page is open, and writes the layout back to the same field. Nothing
// is copied anywhere else.
//
// The codec is lossless, so a round trip changes nothing the builder did not change:
// - Every stored key of a block row is kept: fields the builder shows, fields it does not show
//   (hidden in the admin, unknown to the block definition), `null` and empty values, row ids of
//   arrays, values inside groups and arrays, nested blocks fields inside groups or arrays.
// - Nested blocks fields at a block's own data level become slots (the definitions from
//   `fromPayloadBlocks` say which), so their blocks are blocks on the canvas too.
// - Block ids, order and `blockName` (the block's name in the builder) are kept. No defaults are
//   added: a key that is missing stays missing.
// - Values are taken as stored (read with `depth: 0`): uploads and relationships stay ids.
// It refuses, visibly, what a blocks field cannot hold: a block type without a definition, a block
// type the field does not allow, two blocks with one id, and the builder's own block data that
// Payload has no field for (Tailwind classes, animations, bindings, "hidden", translations).
//
// Pure functions, safe on the server, in the admin and in the canvas.

import { getBlockDefinition } from './blocks'
import { createId } from './ids'
import { isPlainObject } from './tree'
import type { Block, BlockDefinition, Layout, Operation } from './types'

/** The `blockType` a definition stands for in Payload data. */
const slugOf = (def: Pick<BlockDefinition, 'type' | 'payload'>) => def.payload?.slug ?? def.type

/** The block types a Payload blocks field holds, as the builder sees them. */
export type PayloadBlocksStorage = {
  /** The definitions of every block type the field holds, at any depth (from `fromPayloadBlocks`). */
  blocks: readonly BlockDefinition[]
  /** The block types the field allows at its top level. */
  rootTypes: readonly string[]
}

export type PayloadBlocksDecode = { ok: true; layout: Layout } | { ok: false; error: string }

/** The keys of a Payload block row that are not field values. */
const ROW_KEYS = new Set(['id', 'blockType', 'blockName'])

const definitionFor = (storage: PayloadBlocksStorage, blockType: string) =>
  storage.blocks.find((def) => def.payload?.slug === blockType) ?? storage.blocks.find((def) => !def.payload && def.type === blockType)

/**
 * Reads a stored Payload blocks value (`[{ id, blockType, blockName?, ...fields }]`) into a layout.
 * `null` or a missing value is an empty layout. Refuses data it cannot keep exactly.
 */
export function decodePayloadBlocks(value: unknown, storage: PayloadBlocksStorage): PayloadBlocksDecode {
  if (value === null || value === undefined) return { ok: true, layout: { version: 1, blocks: [] } }
  if (!Array.isArray(value)) return { ok: false, error: 'The field does not hold a list of blocks.' }
  const seen = new Set<string>()
  const problems: string[] = []

  const readList = (rows: readonly unknown[], where: string): Block[] =>
    rows.flatMap((row, index) => {
      const block = readRow(row, `${where}${index + 1}`)
      return block ? [block] : []
    })

  const readRow = (row: unknown, where: string): Block | null => {
    if (!isPlainObject(row) || typeof row.blockType !== 'string' || row.blockType === '') {
      problems.push(`Block ${where} has no block type.`)
      return null
    }
    const def = definitionFor(storage, row.blockType)
    if (!def) {
      problems.push(`Block ${where} is a "${row.blockType}" block, which the builder has no definition for. Add it with fromPayloadBlocks().`)
      return null
    }
    let id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : ''
    if (id === '') id = createId()
    if (seen.has(id)) {
      problems.push(`Two blocks have the id "${id}".`)
      return null
    }
    seen.add(id)
    const slotNames = Object.keys(def.slots ?? {})
    const props: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(row)) {
      if (ROW_KEYS.has(key) || raw === undefined || slotNames.includes(key)) continue
      props[key] = raw
    }
    const slots: Record<string, Block[]> = {}
    for (const name of slotNames) {
      const children = row[name]
      // `null` and a missing nested blocks field both mean "no blocks".
      if (!Array.isArray(children) || children.length === 0) continue
      slots[name] = readList(children, `${where}.${name}.`)
    }
    const block: Block = { id, type: def.type }
    if (Object.keys(props).length > 0) block.props = props
    if (Object.keys(slots).length > 0) block.slots = slots
    if (typeof row.blockName === 'string' && row.blockName !== '') block.label = row.blockName
    return block
  }

  const blocks = readList(value, '')
  if (problems.length > 0) return { ok: false, error: problems.join(' ') }
  return { ok: true, layout: { version: 1, blocks } }
}

/**
 * What in a layout a Payload blocks field cannot hold. Empty when the layout can be stored as it is.
 * The builder refuses such a change instead of saving part of it.
 */
export function payloadBlocksProblems(layout: Layout, storage: PayloadBlocksStorage): string[] {
  const problems: string[] = []
  const check = (list: readonly Block[], allowed: readonly string[] | null) => {
    for (const block of list) {
      const def = getBlockDefinition(storage.blocks as BlockDefinition[], block.type)
      const name = def?.label ?? block.type
      if (!def) {
        problems.push(`"${block.type}" blocks cannot be stored in this field.`)
        continue
      }
      if (allowed && !allowed.includes(block.type)) problems.push(`${name} blocks are not allowed here.`)
      if (block.className) problems.push(`${name}: this field cannot store Tailwind classes.`)
      if (block.motion) problems.push(`${name}: this field cannot store animations.`)
      if (block.bindings) problems.push(`${name}: this field cannot store bindings.`)
      if (block.hidden) problems.push(`${name}: this field cannot store hidden blocks.`)
      if (block.locales) problems.push(`${name}: translations are edited in Payload's editor for this field.`)
      for (const [slot, children] of Object.entries(block.slots ?? {})) {
        if (!def.slots?.[slot]) {
          problems.push(`${name} has no "${slot}" slot.`)
          continue
        }
        check(children, def.slots[slot].allow ?? null)
      }
    }
  }
  check(layout.blocks, storage.rootTypes)
  return [...new Set(problems)]
}

/**
 * Writes a layout back as the Payload blocks value: `[{ id, blockType, blockName?, ...props,
 * ...slots }]`. Every prop goes back as it is (no defaults). Check `payloadBlocksProblems` first:
 * data the field cannot hold is not written.
 *
 * `previous`: the value stored now. Payload keeps a row's stored value for a key the saved row
 * leaves out, so a value the layout removed (a cleared prop, a cleared block name) is written as
 * `null` when the stored row (same id) has it. Keys the stored row does not have stay out.
 */
export function encodePayloadBlocks(layout: Layout, storage: PayloadBlocksStorage, previous?: unknown): Record<string, unknown>[] {
  const writeList = (list: readonly Block[]): Record<string, unknown>[] => list.map(writeBlock)
  const writeBlock = (block: Block): Record<string, unknown> => {
    const def = getBlockDefinition(storage.blocks as BlockDefinition[], block.type)
    const row: Record<string, unknown> = { id: block.id, blockType: def ? slugOf(def) : block.type }
    if (block.label) row.blockName = block.label
    for (const [key, value] of Object.entries(block.props ?? {})) {
      if (!ROW_KEYS.has(key)) row[key] = value
    }
    for (const slot of Object.keys(def?.slots ?? {})) row[slot] = writeList(block.slots?.[slot] ?? [])
    return row
  }
  const rows = writeList(layout.blocks)
  if (Array.isArray(previous)) clearRemoved(rows, previous, storage)
  return rows
}

/** The stored block rows of a blocks value by id, at every depth of its slots. */
function storedRowsById(rows: readonly unknown[], storage: PayloadBlocksStorage, into = new Map<string, Record<string, unknown>>()) {
  for (const row of rows) {
    if (!isPlainObject(row) || (typeof row.id !== 'string' && typeof row.id !== 'number')) continue
    into.set(String(row.id), row)
    const def = typeof row.blockType === 'string' ? definitionFor(storage, row.blockType) : undefined
    for (const slot of Object.keys(def?.slots ?? {})) {
      const children = row[slot]
      if (Array.isArray(children)) storedRowsById(children, storage, into)
    }
  }
  return into
}

/** See `encodePayloadBlocks`: writes `null` for the values the new rows removed. */
function clearRemoved(rows: readonly Record<string, unknown>[], previous: readonly unknown[], storage: PayloadBlocksStorage): void {
  const before = storedRowsById(previous, storage)
  const visit = (list: readonly Record<string, unknown>[]) => {
    for (const row of list) {
      const old = before.get(String(row.id))
      const def = typeof row.blockType === 'string' ? definitionFor(storage, row.blockType) : undefined
      if (old && old.blockType === row.blockType) {
        if (!('blockName' in row) && old.blockName !== undefined && old.blockName !== null) row.blockName = null
        if (def) clearFields(def.fields as RowField[], old, row, storage)
      }
      for (const slot of Object.keys(def?.slots ?? {})) {
        const children = row[slot]
        if (Array.isArray(children)) visit(children as Record<string, unknown>[])
      }
    }
  }
  visit(rows)
}

/** Follows Payload's field config: a key of `old` that `next` lacks becomes `null` in `next`. */
function clearFields(fields: readonly RowField[], old: unknown, next: unknown, storage: PayloadBlocksStorage): void {
  if (!isPlainObject(old) || !isPlainObject(next)) return
  for (const f of fields) {
    if ((f.type === 'row' || f.type === 'collapsible' || (f.type === 'group' && !f.name)) && f.fields) {
      clearFields(f.fields, old, next, storage)
      continue
    }
    if (f.type === 'tabs') {
      for (const tab of f.tabs ?? []) {
        if (tab.name) clearFields(tab.fields, old[tab.name], next[tab.name], storage)
        else clearFields(tab.fields, old, next, storage)
      }
      continue
    }
    // Hidden and virtual fields are not in the builder's data: their stored values stay.
    if (!f.name || f.hidden || f.virtual || f.type === 'ui' || f.type === 'join') continue
    if (!(f.name in next)) {
      if (old[f.name] !== undefined && old[f.name] !== null) next[f.name] = null
      continue
    }
    const before = old[f.name]
    const after = next[f.name]
    if (f.type === 'group' && f.fields) clearFields(f.fields, before, after, storage)
    if ((f.type === 'array' || f.type === 'blocks') && Array.isArray(before) && Array.isArray(after)) {
      const byId = new Map(before.filter(isPlainObject).map((r) => [String(r.id), r]))
      for (const row of after) {
        if (!isPlainObject(row)) continue
        const prior = byId.get(String(row.id))
        if (!prior) continue
        if (f.type === 'array' && f.fields) clearFields(f.fields, prior, row, storage)
        if (f.type === 'blocks' && prior.blockType === row.blockType) {
          const slug = String(row.blockType)
          const inline = f.blocks?.find((b) => b.slug === slug)
          const reference = f.blockReferences?.find((b) => (typeof b === 'string' ? b : b.slug) === slug)
          const config = inline ?? (typeof reference === 'object' ? reference : undefined)
          const blockFields = config?.fields ?? (definitionFor(storage, slug)?.fields as RowField[] | undefined)
          if (blockFields) clearFields(blockFields, prior, row, storage)
          if (!('blockName' in row) && prior.blockName !== undefined && prior.blockName !== null) row.blockName = null
        }
      }
    }
  }
}

/**
 * The storage of a Payload blocks field: the definitions of its block types at every depth, found
 * by their Payload slug among `definitions`, and the types it allows at the top level. Throws when
 * a block type of the field has no definition.
 */
export function payloadBlocksStorage(topSlugs: readonly string[], definitions: readonly BlockDefinition[], where: string): PayloadBlocksStorage {
  const bySlug = (slug: string) => definitions.find((def) => def.payload?.slug === slug)
  const missing = topSlugs.filter((slug) => !bySlug(slug))
  if (missing.length > 0) {
    throw new Error(
      `[websiteBuilder] ${where} is a Payload blocks field, and the builder has no definition for its block${missing.length > 1 ? 's' : ''} ${missing.map((s) => `"${s}"`).join(', ')}. Add them to \`blocks\` with fromPayloadBlocks().`,
    )
  }
  const rootTypes = topSlugs.map((slug) => (bySlug(slug) as BlockDefinition).type)
  const found = new Map<string, BlockDefinition>()
  const queue = [...rootTypes]
  while (queue.length > 0) {
    const type = queue.shift() as string
    if (found.has(type)) continue
    const def = definitions.find((d) => d.type === type)
    if (!def) throw new Error(`[websiteBuilder] ${where}: a slot allows "${type}" blocks, and the builder has no definition for them.`)
    found.set(type, def)
    for (const slot of Object.values(def.slots ?? {})) for (const child of slot.allow ?? []) queue.push(child)
  }
  return { blocks: [...found.values()], rootTypes }
}

// ---------------------------------------------------------------------------
// Row ids inside blocks
// ---------------------------------------------------------------------------

type RowField = {
  type: string
  name?: string
  hidden?: boolean
  virtual?: unknown
  fields?: RowField[]
  tabs?: { name?: string; fields: RowField[] }[]
  blocks?: { slug: string; fields: RowField[] }[]
  blockReferences?: (string | { slug: string; fields: RowField[] })[]
}

/**
 * Calls `visit` for every row of an array field and every block of a blocks field inside `data`,
 * following Payload's field config (so a `json` field's own objects are never touched). `visit`
 * may give the row a new id.
 */
function eachRow(fields: readonly RowField[], data: unknown, storage: PayloadBlocksStorage, visit: (row: Record<string, unknown>) => void): void {
  if (!isPlainObject(data)) return
  for (const f of fields) {
    if ((f.type === 'row' || f.type === 'collapsible' || (f.type === 'group' && !f.name)) && f.fields) {
      eachRow(f.fields, data, storage, visit)
      continue
    }
    if (f.type === 'tabs') {
      for (const tab of f.tabs ?? []) eachRow(tab.fields, tab.name ? data[tab.name] : data, storage, visit)
      continue
    }
    if (!f.name) continue
    const value = data[f.name]
    if (f.type === 'group' && f.fields) eachRow(f.fields, value, storage, visit)
    if (!Array.isArray(value)) continue
    if (f.type === 'array' && f.fields) {
      for (const row of value) {
        if (!isPlainObject(row)) continue
        visit(row)
        eachRow(f.fields, row, storage, visit)
      }
    }
    if (f.type === 'blocks') {
      for (const row of value) {
        if (!isPlainObject(row)) continue
        visit(row)
        const slug = String(row.blockType)
        const inline = f.blocks?.find((b) => b.slug === slug)
        const reference = f.blockReferences?.find((b) => (typeof b === 'string' ? b : b.slug) === slug)
        const config = inline ?? (typeof reference === 'object' ? reference : undefined)
        const blockFields = config?.fields ?? (definitionFor(storage, slug)?.fields as RowField[] | undefined)
        if (blockFields) eachRow(blockFields, row, storage, visit)
      }
    }
  }
}

/** Every row id inside the props of `blocks` and their children (array rows, nested Payload blocks). */
function rowIdsOf(blocks: readonly Block[], storage: PayloadBlocksStorage, into: Set<string>): Set<string> {
  for (const block of blocks) {
    const def = getBlockDefinition(storage.blocks as BlockDefinition[], block.type)
    if (def) {
      eachRow(def.fields as RowField[], block.props ?? {}, storage, (row) => {
        if (typeof row.id === 'string' || typeof row.id === 'number') into.add(String(row.id))
      })
    }
    for (const children of Object.values(block.slots ?? {})) rowIdsOf(children, storage, into)
  }
  return into
}

/** The row ids of a stored blocks value (array rows and nested Payload blocks, at every depth). */
export function payloadRowIds(value: unknown, storage: PayloadBlocksStorage): Set<string> {
  const decoded = decodePayloadBlocks(value, storage)
  return decoded.ok ? rowIdsOf(decoded.layout.blocks, storage, new Set()) : new Set()
}

/**
 * Payload stores the rows of array fields and nested blocks fields by their id, in one table per
 * field for every document, and its own editor gives every pasted or copied row a new id. A block
 * inserted by the builder (a duplicate, a paste from another page, a section) carries the rows of
 * what it was copied from. This gives each inserted row a new id unless the id is this
 * document's own: in `owned` (rows its stored value has held: undoing a removal puts the same rows
 * back) and not in the layout or earlier in the same operations. Without `owned`, only ids already
 * in the layout get new ones. Returns `ops` itself when nothing changed.
 */
export function withUniqueRowIds(layout: Layout, ops: readonly Operation[], storage: PayloadBlocksStorage, owned?: ReadonlySet<string>): Operation[] {
  if (!ops.some((op) => op.type === 'insert')) return ops as Operation[]
  const used = rowIdsOf(layout.blocks, storage, new Set())
  let changed = false
  const renew = (block: Block): Block => {
    const def = getBlockDefinition(storage.blocks as BlockDefinition[], block.type)
    let props = block.props
    if (def && props) {
      const copy = structuredClone(props)
      eachRow(def.fields as RowField[], copy, storage, (row) => {
        const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : null
        if (id === null) return
        if (!used.has(id) && (!owned || owned.has(id))) {
          used.add(id)
          return
        }
        let next = createId()
        while (used.has(next)) next = createId()
        row.id = next
        used.add(next)
        changed = true
      })
      props = copy
    }
    const slots = block.slots
      ? Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, children.map(renew)]))
      : undefined
    return { ...block, ...(props ? { props } : {}), ...(slots ? { slots } : {}) }
  }
  const out = ops.map((op) => (op.type === 'insert' ? { ...op, block: renew(op.block) } : op))
  return changed ? out : (ops as Operation[])
}
