// Converts content between Payload's `blocks` field shape and the builder layout.
//
// Payload stores a blocks field as `[{ id, blockType, blockName?, ...fieldValues }]`. Nested blocks
// fields hold more of the same. The builder stores `{ version: 1, blocks: [{ id, type, props,
// slots, label }] }`. A block definition made by `fromPayloadBlocks` knows which of the Payload
// block's fields are slots (its nested blocks fields) and which are props.
//
// Pure functions, safe on the server, in the admin and in the canvas.

import { getBlockDefinition } from './blocks'
import { sameJson } from './fieldSemantics'
import { dataFields, fieldBlocks, hasStaticDefault, type DataField, type LooseBlock } from './fields'
import { fallbackChain, localizedKeys } from './locale'
import { isPlainObject, normalizeLayout } from './tree'
import type { Block, BlockDefinition, Layout, LocaleSettings } from './types'

export { hasStaticDefault } from './fields'

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
 * `label`. Ids are kept when they are valid and unique. Upload and relationship values are reduced
 * to IDs, so populated data (`depth > 0`) converts too. Blocks without a definition are left out
 * and counted in the report.
 *
 * Empty values: `null` (Payload's "no value") is kept for a field with a `defaultValue`, because
 * there it means "cleared" and the default must not come back at render time (see
 * `withFieldDefaults`). For other fields `null` and a missing key mean the same, so it is left out.
 * Missing keys stay missing; `withLayoutDefaults` fills their defaults.
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
    if (value === undefined) continue
    const field = known.get(key)
    if (value === null) {
      // A cleared field with a default stays cleared.
      if (field && hasStaticDefault(field)) props[key] = null
      continue
    }
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
// Localized Payload data (a read with `locale: 'all'`) -> one layout with `locales`
// ---------------------------------------------------------------------------
//
// With `locale: 'all'`, Payload returns each localized field as a map of locale codes to values,
// at the depth where the field is localized: `{ text: { en: 'Hello', de: 'Hallo' } }`. A localized
// `blocks` field holds one array per locale: `{ en: [...], de: [...] }`. Fields inside a localized
// field are not localized again (Payload ignores their `localized`).
//
// The conversion reads each locale's value out of that data, converts each locale with
// `convertPayloadBlocksLayout`, and merges the layouts into one (docs/architecture.md,
// "Localization"): the structure and the shared props come from the default locale, and each
// other locale keeps its own values of localized props in `block.locales[code]`.

/** The source `blocks` field config (raw or sanitized): `localized`, `blocks`, `blockReferences`. */
export type PayloadSourceField = Record<string, unknown> & { localized?: unknown; blocks?: unknown; blockReferences?: unknown }

/** Block configs by slug (`payload.blocks`), for `blockReferences`. */
export type PayloadBlockReferences = Readonly<Record<string, unknown>>

/** A block of another locale with no matching block in the default locale. It is left out. */
export type UnmatchedLocaleBlock = { locale: string; id: string; blockType: string }

export type LocalizedConversionReport = PayloadConversionReport & {
  /** Blocks of other locales with no matching block in the default locale (left out). */
  unmatched: UnmatchedLocaleBlock[]
  /**
   * Props whose value differs in another locale, but the block definition does not localize them
   * (the default locale's value is kept), by `blockType`.
   */
  notLocalized: Record<string, string[]>
}

export type LocalizedConversion = { layout: Layout; report: LocalizedConversionReport; alreadyLayout: boolean }

const isLocalizedField = (field: unknown) => isPlainObject(field) && field.localized === true

function sourceAsField(field: PayloadSourceField): DataField {
  return { ...(field as Record<string, unknown>), type: 'blocks', name: typeof field.name === 'string' ? field.name : 'blocks' } as DataField
}

/** The block configs a Payload blocks field allows: inline `blocks` plus `blockReferences`. */
function blockConfigsOf(field: Record<string, unknown>, references: PayloadBlockReferences): LooseBlock[] {
  const out: LooseBlock[] = []
  const entries = [...(Array.isArray(field.blocks) ? field.blocks : []), ...(Array.isArray(field.blockReferences) ? field.blockReferences : [])]
  for (const entry of entries) {
    const block = typeof entry === 'string' ? references[entry] : entry
    if (isPlainObject(block) && typeof block.slug === 'string' && Array.isArray(block.fields)) out.push(block as LooseBlock)
  }
  return out
}

/**
 * True when the Payload `blocks` field, or any field inside its blocks (at any depth), is
 * localized. Then a read with `locale: 'all'` returns locale maps.
 */
export function payloadFieldIsLocalized(field: PayloadSourceField, references: PayloadBlockReferences = {}): boolean {
  const seen = new Set<string>()
  const visit = (f: DataField): boolean => {
    if (isLocalizedField(f)) return true
    if (f.type === 'group' || f.type === 'array') return dataFields(f.fields).some(visit)
    if (f.type !== 'blocks') return false
    return blockConfigsOf(f as Record<string, unknown>, references).some((block) => {
      if (seen.has(block.slug)) return false
      seen.add(block.slug)
      return dataFields(block.fields).some(visit)
    })
  }
  return visit(sourceAsField(field))
}

type PickContext = { locale: string; chain: readonly string[]; references: PayloadBlockReferences }

/** Payload's read rule: text and textarea fall back when empty too; other types only when missing. */
function fallsBack(field: DataField, value: unknown): boolean {
  if (isEmpty(value)) return true
  return value === '' && (field.type === 'text' || field.type === 'textarea')
}

/**
 * One locale's value of a field from a `locale: 'all'` read. `prop` is the level of a block's own
 * fields: a localized field there gives the locale's own value only (a missing value stays
 * missing, so the builder's fallback works). Below a prop (`nested`, inside a group or an array
 * that is not localized itself) the builder stores the whole prop per locale, so a missing value
 * takes Payload's fallback, the value a reader saw before the migration.
 */
function pickField(field: DataField, value: unknown, ctx: PickContext, level: 'prop' | 'nested'): unknown {
  if (isLocalizedField(field)) {
    // Everything inside a localized field belongs to the locale: nothing below is a locale map.
    if (!isPlainObject(value)) return undefined
    const own = value[ctx.locale]
    if (level === 'prop' || !fallsBack(field, own)) return own
    for (const code of ctx.chain) {
      const candidate = value[code]
      if (!isEmpty(candidate) && candidate !== '') return candidate
    }
    return own
  }
  switch (field.type) {
    case 'group':
      return isPlainObject(value) ? pickFields(field.fields ?? [], value, ctx, 'nested') : value
    case 'array':
      return Array.isArray(value) ? value.map((row) => (isPlainObject(row) ? pickFields(field.fields ?? [], row, ctx, 'nested') : row)) : value
    case 'blocks': {
      if (!Array.isArray(value)) return value
      const configs = blockConfigsOf(field as Record<string, unknown>, ctx.references)
      return value.map((row) => {
        if (!isPlainObject(row)) return row
        const config = configs.find((b) => b.slug === row.blockType)
        // The rows of a blocks field at prop level are blocks (slots): their fields are props.
        return config ? pickFields(config.fields, row, ctx, level) : row
      })
    }
    default:
      return value
  }
}

function pickFields(fields: readonly unknown[], data: Record<string, unknown>, ctx: PickContext, level: 'prop' | 'nested'): Record<string, unknown> {
  const out = { ...data }
  for (const field of dataFields(fields)) {
    if (!Object.hasOwn(out, field.name)) continue
    const value = pickField(field, out[field.name], ctx, level)
    if (value === undefined) delete out[field.name]
    else out[field.name] = value
  }
  return out
}

/**
 * One locale's value of a Payload `blocks` field read with `locale: 'all'`, in the shape a read in
 * that locale gives (localized fields hold the locale's value). See `pickField` for fallback.
 */
export function payloadValueInLocale(
  value: unknown,
  field: PayloadSourceField,
  locale: string,
  settings: LocaleSettings,
  references: PayloadBlockReferences = {},
): unknown {
  return pickField(sourceAsField(field), value, { locale, chain: fallbackChain(settings, locale), references }, 'prop')
}

/**
 * Converts a Payload `blocks` field read with `locale: 'all'` into one builder layout with
 * translations: the default locale gives the structure and `props`, and each other locale's own
 * values of localized props go to `block.locales[code]`. When the structure differs per locale
 * (a localized `blocks` field, or a localized nested blocks field), blocks are matched by id, then
 * by position and type; blocks of other locales without a match are left out and reported.
 */
export function convertLocalizedPayloadBlocks(
  value: unknown,
  source: { field: PayloadSourceField; references?: PayloadBlockReferences },
  blocks: readonly BlockDefinition[],
  settings: LocaleSettings,
  options: ConvertPayloadOptions = {},
): LocalizedConversion {
  const inLocale = (code: string) => payloadValueInLocale(value, source.field, code, settings, source.references)
  const base = convertPayloadBlocksLayout(inLocale(settings.defaultLocale), blocks, options)
  const report: LocalizedConversionReport = { ...base.report, unknownTypes: { ...base.report.unknownTypes }, droppedFields: {}, unmatched: [], notLocalized: {} }
  for (const [type, names] of Object.entries(base.report.droppedFields)) report.droppedFields[type] = [...names]
  const others: Record<string, Layout> = {}
  for (const code of settings.locales) {
    if (code === settings.defaultLocale) continue
    const part = convertPayloadBlocksLayout(inLocale(code), blocks, options)
    others[code] = part.layout
    for (const [type, n] of Object.entries(part.report.unknownTypes)) report.unknownTypes[type] = Math.max(report.unknownTypes[type] ?? 0, n)
    for (const [type, names] of Object.entries(part.report.droppedFields)) addNames(report.droppedFields, type, names)
  }
  const merged = mergeLocaleLayouts(base.layout, others, blocks)
  report.unmatched = merged.unmatched
  report.notLocalized = merged.notLocalized
  return { layout: merged.layout, report, alreadyLayout: base.alreadyLayout }
}

function addNames(target: Record<string, string[]>, type: string, names: readonly string[]): void {
  const list = (target[type] ??= [])
  for (const name of names) if (!list.includes(name)) list.push(name)
}

/**
 * Merges one layout per locale into the stored form. `base` is the default locale's layout (the
 * structure and `props`); `others` maps each other locale to its layout. Blocks are matched by id,
 * then by position and type. A matched block gets the locale's values of its localized props in
 * `locales[code]`: a prop localized itself keeps its own value; a group or array that only holds
 * localized fields is stored only when it differs from the default locale's value. Never mutates.
 */
export function mergeLocaleLayouts(
  base: Layout,
  others: Readonly<Record<string, Layout>>,
  blocks: readonly BlockDefinition[],
): { layout: Layout; unmatched: UnmatchedLocaleBlock[]; notLocalized: Record<string, string[]> } {
  const result = structuredClone(base)
  const unmatched: UnmatchedLocaleBlock[] = []
  const notLocalized: Record<string, string[]> = {}

  const mergeBlock = (target: Block, source: Block, locale: string) => {
    const def = getBlockDefinition(blocks, target.type)
    const keys = localizedKeys(def)
    const own: Record<string, unknown> = {}
    for (const key of keys) {
      const value = source.props?.[key]
      if (value === undefined) continue
      const direct = dataFields(def?.fields as unknown[]).some((f) => f.name === key && isLocalizedField(f))
      if (!direct && sameJson(value, target.props?.[key])) continue
      own[key] = value
    }
    if (Object.keys(own).length > 0) target.locales = { ...target.locales, [locale]: own }
    for (const [key, value] of Object.entries(source.props ?? {})) {
      if (keys.has(key) || value === undefined || sameJson(value, target.props?.[key])) continue
      addNames(notLocalized, def ? payloadSlugOf(def) : target.type, [key])
    }
    const slotNames = new Set([...Object.keys(target.slots ?? {}), ...Object.keys(source.slots ?? {})])
    for (const name of slotNames) mergeList(target.slots?.[name] ?? [], source.slots?.[name] ?? [], locale)
  }

  const mergeList = (list: Block[], from: readonly Block[], locale: string) => {
    const match = matchBlocks(list, from)
    const used = new Set(match.filter((j): j is number => j !== undefined))
    from.forEach((block, j) => {
      if (used.has(j)) return
      const def = getBlockDefinition(blocks, block.type)
      unmatched.push({ locale, id: block.id, blockType: def ? payloadSlugOf(def) : block.type })
    })
    list.forEach((block, i) => {
      const j = match[i]
      if (j !== undefined) mergeBlock(block, from[j], locale)
    })
  }

  for (const [locale, layout] of Object.entries(others)) mergeList(result.blocks, layout.blocks, locale)
  return { layout: normalizeLayout(result), unmatched, notLocalized }
}

/** For each block of `list`, the index of its match in `from`: same id and type, else same position and type. */
function matchBlocks(list: readonly Block[], from: readonly Block[]): Array<number | undefined> {
  const byId = new Map(from.map((block, j) => [block.id, j]))
  const match: Array<number | undefined> = list.map(() => undefined)
  const used = new Set<number>()
  list.forEach((block, i) => {
    const j = byId.get(block.id)
    if (j === undefined || used.has(j) || from[j].type !== block.type) return
    match[i] = j
    used.add(j)
  })
  list.forEach((block, i) => {
    if (match[i] !== undefined || i >= from.length || used.has(i) || from[i].type !== block.type) return
    match[i] = i
    used.add(i)
  })
  return match
}

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
 *
 * Only keys that are not there (`undefined`) get their default. A stored `null` or `''` is a
 * value someone cleared, and stays empty, as in Payload (defaults apply only when a block is made).
 */
export function withFieldDefaults(props: Record<string, unknown>, fields: readonly unknown[]): Record<string, unknown> {
  let result = props
  for (const field of dataFields(fields)) {
    const current = result[field.name]
    let next: unknown = current
    if (current === undefined) {
      if (hasStaticDefault(field)) next = structuredClone(field.defaultValue)
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

/**
 * The layout with `withFieldDefaults` applied to every block's props (at every depth), as if each
 * block was just made in the editor. Translations (`block.locales`) are not filled: a missing
 * translation falls back to another locale. Returns the same layout when nothing is missing.
 */
export function withLayoutDefaults(layout: Layout, blocks: readonly BlockDefinition[]): Layout {
  const fill = (list: Block[]): Block[] => {
    let changed = false
    const out = list.map((block) => {
      const def = getBlockDefinition(blocks, block.type)
      let next = block
      const before = block.props ?? {}
      const props = def ? withFieldDefaults(before, def.fields) : before
      if (props !== before) next = { ...next, props }
      if (block.slots) {
        let slotsChanged = false
        const slots: Record<string, Block[]> = {}
        for (const [name, children] of Object.entries(block.slots)) {
          slots[name] = fill(children)
          if (slots[name] !== children) slotsChanged = true
        }
        if (slotsChanged) next = { ...next, slots }
      }
      if (next !== block) changed = true
      return next
    })
    return changed ? out : list
  }
  const filled = fill(layout.blocks)
  return filled === layout.blocks ? layout : { ...layout, blocks: filled }
}
