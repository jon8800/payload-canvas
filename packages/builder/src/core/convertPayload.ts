// Converts content between Payload's `blocks` field shape and the builder layout.
//
// Payload stores a blocks field as `[{ id, blockType, blockName?, ...fieldValues }]`. Nested blocks
// fields hold more of the same. The builder stores `{ version: 1, blocks: [{ id, type, props,
// slots, label }] }`. A block definition made by `fromPayloadBlocks` knows which of the Payload
// block's fields are slots (its nested blocks fields) and which are props.
//
// Pure functions, safe on the server, in the admin and in the canvas.

import { getBlockDefinition } from './blocks'
import { dataFields, fieldBlocks, type DataField } from './fields'
import { isPlainObject, normalizeLayout } from './tree'
import type { Block, BlockDefinition, Layout } from './types'

/** A block in Payload's shape: `{ id, blockType, blockName?, ...fieldValues }`. */
export type PayloadBlockData = Record<string, unknown> & { id: string; blockType: string; blockName?: string }

export type PayloadConversionReport = {
  /** Blocks in the result, at every depth. */
  blocks: number
  /** Payload `blockType`s that have no block definition, with how many blocks were left out. */
  unknownTypes: Record<string, number>
  /** Fields that had a value but are not in the block definition (left out), by `blockType`. */
  droppedFields: Record<string, string[]>
}

export type PayloadConversion = {
  layout: Layout
  report: PayloadConversionReport
  /** True when the value was a builder layout already (it is only normalized). */
  alreadyLayout: boolean
}

export type ConvertPayloadOptions = {
  /**
   * Keep blocks without a definition, with their fields as props, instead of leaving them out.
   * The builder refuses to save a layout with unknown block types, so use this only to inspect.
   */
  keepUnknown?: boolean
}

/** The `blockType` a definition stands for in Payload data. */
export function payloadSlugOf(def: Pick<BlockDefinition, 'type' | 'payload'>): string {
  return def.payload?.slug ?? def.type
}

/**
 * The definition for a Payload `blockType`: the one made from that Payload block
 * (`payload.slug`), else the one with that `type`.
 */
export function definitionForBlockType(blocks: readonly BlockDefinition[], blockType: string): BlockDefinition | undefined {
  return blocks.find((b) => b.payload?.slug === blockType) ?? getBlockDefinition(blocks, blockType)
}

/** True for a Payload blocks value: an array of objects with a `blockType`. */
export function isPayloadBlocksValue(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.some((item) => isPlainObject(item) && typeof item.blockType === 'string')
}

function isBuilderLayoutValue(value: unknown): boolean {
  if (isPlainObject(value)) return value.version === 1 && Array.isArray(value.blocks)
  return Array.isArray(value) && value.length > 0 && !isPayloadBlocksValue(value)
}

const PAYLOAD_KEYS = new Set(['id', 'blockType', 'blockName'])

/**
 * Converts a Payload `blocks` field value into a builder layout. Nested blocks fields that the
 * definition declares as slots become slots (recursively). `blockName` becomes the block's
 * `label`. Ids are kept when they are valid and unique. Empty values (`null`, Payload's "empty")
 * are left out, and upload and relationship values are reduced to IDs, so populated data
 * (`depth > 0`) converts too. Blocks without a definition are left out and counted in the report.
 *
 * A value that is already a builder layout is only normalized, so the conversion is idempotent.
 */
export function convertPayloadBlocksLayout(
  value: unknown,
  blocks: readonly BlockDefinition[],
  options: ConvertPayloadOptions = {},
): PayloadConversion {
  const report: PayloadConversionReport = { blocks: 0, unknownTypes: {}, droppedFields: {} }
  if (isBuilderLayoutValue(value)) {
    const layout = normalizeLayout(value)
    report.blocks = countBlocks(layout.blocks)
    return { layout, report, alreadyLayout: true }
  }
  const items = Array.isArray(value) ? value : []
  const converted = items.map((item) => convertItem(item, blocks, report, options)).filter((b): b is Block => b !== null)
  // normalizeLayout gives the canonical form: unique ids, no empty objects.
  const layout = normalizeLayout({ version: 1, blocks: converted })
  report.blocks = countBlocks(layout.blocks)
  return { layout, report, alreadyLayout: false }
}

function countBlocks(blocks: readonly Block[]): number {
  let count = 0
  for (const block of blocks) {
    count++
    for (const children of Object.values(block.slots ?? {})) count += countBlocks(children)
  }
  return count
}

function convertItem(
  raw: unknown,
  blocks: readonly BlockDefinition[],
  report: PayloadConversionReport,
  options: ConvertPayloadOptions,
): Block | null {
  if (!isPlainObject(raw) || typeof raw.blockType !== 'string' || raw.blockType === '') return null
  const blockType = raw.blockType
  const def = definitionForBlockType(blocks, blockType)
  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : ''
  const label = typeof raw.blockName === 'string' && raw.blockName.trim() !== '' ? raw.blockName.trim() : undefined

  if (!def) {
    report.unknownTypes[blockType] = (report.unknownTypes[blockType] ?? 0) + 1
    if (!options.keepUnknown) return null
    const props = Object.fromEntries(Object.entries(raw).filter(([key, v]) => !PAYLOAD_KEYS.has(key) && !isEmpty(v)))
    return { id, type: blockType, props, ...(label ? { label } : {}) }
  }

  const slotNames = new Set(Object.keys(def.slots ?? {}))
  const fields = dataFields(def.fields as unknown[])
  const known = new Map(fields.map((f) => [f.name, f]))
  const props: Record<string, unknown> = {}
  const slots: Record<string, Block[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (PAYLOAD_KEYS.has(key)) continue
    if (slotNames.has(key)) {
      if (!Array.isArray(value)) continue
      slots[key] = value.map((child) => convertItem(child, blocks, report, options)).filter((b): b is Block => b !== null)
      continue
    }
    if (isEmpty(value)) continue
    const field = known.get(key)
    if (!field) {
      const dropped = (report.droppedFields[blockType] ??= [])
      if (!dropped.includes(key)) dropped.push(key)
      continue
    }
    props[key] = referencesToIds(field, value)
  }
  return { id, type: def.type, props, slots, ...(label ? { label } : {}) }
}

const isEmpty = (value: unknown) => value === undefined || value === null

// ---------------------------------------------------------------------------
// References: populated documents -> IDs
// ---------------------------------------------------------------------------

type Id = string | number
const isId = (value: unknown): value is Id => (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value))

/** An ID, or the ID of a populated document. Anything else stays as it is. */
function toId(value: unknown): unknown {
  if (isPlainObject(value) && isId(value.id)) return value.id
  return value
}

function relationToIds(field: DataField, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => relationToIds({ ...field, hasMany: false }, item))
  if (Array.isArray(field.relationTo)) {
    if (!isPlainObject(value) || typeof value.relationTo !== 'string') return value
    return { relationTo: value.relationTo, value: toId(value.value) }
  }
  return toId(value)
}

/** Reduces upload and relationship values to IDs, inside groups, arrays and nested blocks too. */
function referencesToIds(field: DataField, value: unknown): unknown {
  switch (field.type) {
    case 'upload':
    case 'relationship':
      return relationToIds(field, value)
    case 'group':
      return isPlainObject(value) ? objectToIds(field.fields ?? [], value) : value
    case 'array':
      return Array.isArray(value) ? value.map((row) => (isPlainObject(row) ? objectToIds(field.fields ?? [], row) : row)) : value
    case 'blocks': {
      if (!Array.isArray(value)) return value
      const variants = fieldBlocks(field)
      return value.map((row) => {
        if (!isPlainObject(row)) return row
        const variant = variants.find((b) => b.slug === row.blockType)
        return variant ? objectToIds(variant.fields, row) : row
      })
    }
    default:
      return value
  }
}

function objectToIds(fields: readonly unknown[], data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }
  for (const field of dataFields(fields)) {
    if (field.name in out && !isEmpty(out[field.name])) out[field.name] = referencesToIds(field, out[field.name])
  }
  return out
}

// ---------------------------------------------------------------------------
// Builder block -> Payload shape (for components written for Payload's data)
// ---------------------------------------------------------------------------

/**
 * A builder block in Payload's shape: `{ id, blockType, blockName?, ...props }`, with every slot
 * as a nested array of Payload-shaped blocks (hidden blocks left out), and the field defaults
 * filled in for props without a value, as Payload does for a new block.
 */
export function toPayloadBlock(block: Block, blocks: readonly BlockDefinition[]): PayloadBlockData {
  const def = getBlockDefinition(blocks, block.type)
  const out: PayloadBlockData = {
    ...withFieldDefaults(block.props ?? {}, def?.fields ?? []),
    id: block.id,
    blockType: def ? payloadSlugOf(def) : block.type,
  }
  if (block.label) out.blockName = block.label
  const slotNames = new Set([...Object.keys(def?.slots ?? {}), ...Object.keys(block.slots ?? {})])
  for (const slot of slotNames) {
    out[slot] = (block.slots?.[slot] ?? []).filter((child) => !child.hidden).map((child) => toPayloadBlock(child, blocks))
  }
  return out
}

/**
 * Props with each missing field's `defaultValue` filled in (JSON values only, not functions),
 * inside named groups too. Returns the same object when nothing is missing.
 */
export function withFieldDefaults(props: Record<string, unknown>, fields: readonly unknown[]): Record<string, unknown> {
  let result = props
  for (const field of dataFields(fields)) {
    const current = result[field.name]
    let next: unknown = current
    if (current === undefined || current === null) {
      const fallback = field.defaultValue
      if (fallback !== undefined && typeof fallback !== 'function') next = structuredClone(fallback)
      else if (field.type === 'group') {
        const group = withFieldDefaults({}, field.fields ?? [])
        if (Object.keys(group).length > 0) next = group
      }
    } else if (field.type === 'group' && isPlainObject(current)) {
      next = withFieldDefaults(current, field.fields ?? [])
    }
    if (next !== current) {
      if (result === props) result = { ...props }
      result[field.name] = next
    }
  }
  return result
}
