// Layout validation without external libraries. Mirrors the JSON Schema from schema.ts, plus
// the rules a schema cannot express (unique ids). Optional props may be `null` (Payload's own
// "empty" value); the schema leaves that out to keep it simple for AI tools.

import { getBlockDefinition } from './blocks'
import { dataFields, fieldBlocks, optionValues, type DataField, type LooseField } from './fields'
import { isPlainObject } from './tree'
import type { BlockDefinition, SlotDefinition } from './types'

/**
 * - `invalid`: blocks every save.
 * - `required` (a required prop is empty), `nesting` (a block in a slot that refuses it) and
 *   `binding` (a binding the prop cannot use): block only publishing, so drafts can hold
 *   unfinished work and older data stays editable.
 * - `unknown-prop`, `unknown-key`: warnings, never blocking.
 */
export type LayoutErrorCode = 'invalid' | 'required' | 'nesting' | 'binding' | 'unknown-prop' | 'unknown-key'

export type LayoutError = { blockId?: string; path: string; message: string; code: LayoutErrorCode }

/** Codes that block publishing but not draft saves. */
export const PUBLISH_ONLY_CODES: ReadonlySet<LayoutErrorCode> = new Set(['required', 'nesting', 'binding'])

/** True when the error never blocks a save (only logged or shown). */
export function isLayoutWarning(error: Pick<LayoutError, 'code'>): boolean {
  return error.code === 'unknown-prop' || error.code === 'unknown-key'
}

/** True when the error blocks this save: everything but warnings, and publish-only codes only when publishing. */
export function isBlockingError(error: Pick<LayoutError, 'code'>, publishing: boolean): boolean {
  if (isLayoutWarning(error)) return false
  return publishing || !PUBLISH_ONLY_CODES.has(error.code)
}

const BLOCK_KEYS = new Set(['id', 'type', 'props', 'className', 'slots', 'bindings', 'hidden', 'label'])

/** Checks structure, unique ids, known block types, slot rules and prop types. */
export function validateLayout(layout: unknown, blocks: BlockDefinition[]): LayoutError[] {
  const errors: LayoutError[] = []
  if (!isPlainObject(layout)) return [{ path: '', message: 'Layout must be an object', code: 'invalid' }]
  if (layout.version !== 1) errors.push({ path: 'version', message: 'version must be 1', code: 'invalid' })
  if (!Array.isArray(layout.blocks)) {
    errors.push({ path: 'blocks', message: 'blocks must be an array', code: 'invalid' })
    return errors
  }
  const seen = new Set<string>()
  layout.blocks.forEach((block, i) => checkBlock(block, `blocks[${i}]`, null, [], blocks, seen, errors))
  return errors
}

/** `label`: the owner block's name for messages. */
type Owner = { type: string; label: string; slot: string; def: SlotDefinition } | null
/** Types refused by an ancestor slot's `disallow`, with that ancestor's name. */
type Banned = Array<{ type: string; by: string }>

const nameOf = (value: Record<string, unknown>, def: BlockDefinition | undefined, type: string) =>
  (typeof value.label === 'string' && value.label.trim()) || def?.label || type

function checkBlock(
  value: unknown,
  path: string,
  owner: Owner,
  banned: Banned,
  blocks: BlockDefinition[],
  seen: Set<string>,
  errors: LayoutError[],
): void {
  if (!isPlainObject(value)) {
    errors.push({ path, message: 'Block must be an object', code: 'invalid' })
    return
  }
  const blockId = typeof value.id === 'string' && value.id ? value.id : undefined
  const report: Report = (at, message, code = 'invalid') =>
    errors.push({ ...(blockId ? { blockId } : {}), path: at, message, code })

  if (!blockId) report(`${path}.id`, 'id must be a non-empty string')
  else if (seen.has(blockId)) report(`${path}.id`, `Duplicate block id "${blockId}"`)
  else seen.add(blockId)

  for (const key of Object.keys(value)) {
    if (!BLOCK_KEYS.has(key)) report(`${path}.${key}`, `Unknown block key "${key}"`, 'unknown-key')
  }

  const type = typeof value.type === 'string' && value.type ? value.type : undefined
  const def = type ? getBlockDefinition(blocks, type) : undefined
  if (!type) report(`${path}.type`, 'type must be a non-empty string')
  else if (!def) report(`${path}.type`, `Unknown block type "${type}"`)
  const typeLabel = def?.label ?? type
  if (type && owner) {
    const allow = owner.def.allow
    if (allow && !allow.includes('*') && !allow.includes(type)) {
      report(path, `${typeLabel} cannot go inside ${owner.label}`, 'nesting')
    }
  }
  const refusedBy = type ? banned.find((b) => b.type === type) : undefined
  if (refusedBy) report(path, `${typeLabel} cannot go inside ${refusedBy.by}`, 'nesting')

  if (value.props !== undefined && !isPlainObject(value.props)) {
    report(`${path}.props`, 'props must be an object')
  } else if (def) {
    checkFields(def.fields as unknown[], value.props ?? {}, `${path}.props`, report)
  }

  if (value.className !== undefined) {
    if (typeof value.className !== 'string') report(`${path}.className`, 'className must be a string')
    else if (def?.styles === false) report(`${path}.className`, `Block type "${type}" does not take a className`)
  }
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') {
    report(`${path}.hidden`, 'hidden must be a boolean')
  }
  if (value.label !== undefined && typeof value.label !== 'string') {
    report(`${path}.label`, 'label must be a string')
  }
  if (value.bindings !== undefined) {
    if (!isPlainObject(value.bindings)) report(`${path}.bindings`, 'bindings must be an object')
    else {
      for (const [key, target] of Object.entries(value.bindings)) {
        if (typeof target !== 'string') report(`${path}.bindings.${key}`, 'A binding must be a field path string')
      }
    }
  }

  if (value.slots === undefined) return
  if (!isPlainObject(value.slots)) {
    report(`${path}.slots`, 'slots must be an object')
    return
  }
  for (const [name, children] of Object.entries(value.slots)) {
    const slotPath = `${path}.slots.${name}`
    const slotDef = def?.slots?.[name]
    if (def && !slotDef) report(slotPath, `Block type "${type}" has no slot "${name}"`)
    if (!Array.isArray(children)) {
      report(slotPath, 'A slot must be an array of blocks')
      continue
    }
    const label = nameOf(value, def, type ?? '')
    const childOwner: Owner = slotDef && type ? { type, label, slot: name, def: slotDef } : null
    const childBanned = slotDef?.disallow?.length ? [...banned, ...slotDef.disallow.map((t) => ({ type: t, by: label }))] : banned
    children.forEach((child, i) => checkBlock(child, `${slotPath}[${i}]`, childOwner, childBanned, blocks, seen, errors))
  }
}

type Report = (path: string, message: string, code?: LayoutErrorCode) => void

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function checkFields(fields: readonly unknown[], data: Record<string, unknown>, path: string, report: Report, extra: string[] = []): void {
  const list = dataFields(fields)
  const known = new Set([...extra, ...list.map((f) => f.name)])
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key) && value !== undefined) report(`${path}.${key}`, `Unknown prop "${key}"`, 'unknown-prop')
  }
  for (const field of list) {
    const value = data[field.name]
    const at = `${path}.${field.name}`
    if (isEmpty(value)) {
      if (field.required) {
        report(at, `"${field.name}" is required`, 'required')
        continue
      }
      if (value === undefined || value === null) continue
    }
    checkValue(field, value, at, report)
  }
}

function checkMany(field: LooseField, value: unknown, path: string, report: Report, item: (v: unknown, at: string) => void): void {
  if (!Array.isArray(value)) {
    report(path, 'Must be an array')
    return
  }
  if (typeof field.minRows === 'number' && value.length < field.minRows) report(path, `Must have at least ${field.minRows} items`)
  if (typeof field.maxRows === 'number' && value.length > field.maxRows) report(path, `Must have at most ${field.maxRows} items`)
  value.forEach((v, i) => item(v, `${path}[${i}]`))
}

function checkString(field: LooseField, value: unknown, path: string, report: Report): void {
  if (typeof value !== 'string') return report(path, 'Must be a string')
  if (typeof field.minLength === 'number' && value.length < field.minLength) report(path, `Must be at least ${field.minLength} characters`)
  if (typeof field.maxLength === 'number' && value.length > field.maxLength) report(path, `Must be at most ${field.maxLength} characters`)
}

function checkNumber(field: LooseField, value: unknown, path: string, report: Report): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return report(path, 'Must be a number')
  if (typeof field.min === 'number' && value < field.min) report(path, `Must be at least ${field.min}`)
  if (typeof field.max === 'number' && value > field.max) report(path, `Must be at most ${field.max}`)
}

function isId(value: unknown): boolean {
  return (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value))
}

function checkRelation(field: LooseField, value: unknown, path: string, report: Report): void {
  const to = field.relationTo
  if (!Array.isArray(to)) {
    if (!isId(value)) report(path, `Must be the ID (string or number) of a "${to}" document`)
    return
  }
  if (!isPlainObject(value) || !isId(value.value) || typeof value.relationTo !== 'string') {
    return report(path, 'Must be { relationTo, value } with a document ID as value')
  }
  if (!to.includes(value.relationTo)) report(`${path}.relationTo`, `Must be one of: ${to.join(', ')}`)
}

function checkValue(field: DataField, value: unknown, path: string, report: Report): void {
  switch (field.type) {
    case 'text':
      if (field.hasMany) return checkMany(field, value, path, report, (v, at) => checkString(field, v, at, report))
      return checkString(field, value, path, report)
    case 'textarea':
    case 'email':
    case 'code':
      return checkString(field, value, path, report)
    case 'number':
      if (field.hasMany) return checkMany(field, value, path, report, (v, at) => checkNumber(field, v, at, report))
      return checkNumber(field, value, path, report)
    case 'checkbox':
      if (typeof value !== 'boolean') report(path, 'Must be true or false')
      return
    case 'select':
    case 'radio': {
      const options = optionValues(field)
      const one = (v: unknown, at: string) => {
        if (typeof v !== 'string' || !options.includes(v)) report(at, `Must be one of: ${options.join(', ')}`)
      }
      if (field.type === 'select' && field.hasMany) return checkMany(field, value, path, report, one)
      return one(value, path)
    }
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) report(path, 'Must be an ISO date string')
      return
    case 'upload':
    case 'relationship':
      if (field.hasMany) return checkMany(field, value, path, report, (v, at) => checkRelation(field, v, at, report))
      return checkRelation(field, value, path, report)
    case 'richText':
      if (!isPlainObject(value) || !isPlainObject(value.root)) report(path, 'Must be Lexical rich text JSON with a root node')
      return
    case 'point':
      if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        report(path, 'Must be [longitude, latitude]')
      }
      return
    case 'group':
      if (!isPlainObject(value)) return report(path, 'Must be an object')
      return checkFields(field.fields ?? [], value, path, report)
    case 'array':
      return checkMany(field, value, path, report, (row, at) => {
        if (!isPlainObject(row)) return report(at, 'Must be an object')
        if (row.id !== undefined && row.id !== null && typeof row.id !== 'string') report(`${at}.id`, 'Must be a string')
        checkFields(field.fields ?? [], row, at, report, ['id'])
      })
    case 'blocks': {
      const variants = fieldBlocks(field)
      return checkMany(field, value, path, report, (row, at) => {
        if (!isPlainObject(row)) return report(at, 'Must be an object')
        const variant = variants.find((b) => b.slug === row.blockType)
        if (!variant) return report(`${at}.blockType`, `Must be one of: ${variants.map((b) => b.slug).join(', ')}`)
        checkFields(variant.fields, row, at, report, ['id', 'blockName', 'blockType'])
      })
    }
    default:
      // json and unknown field types accept any value.
      return
  }
}
