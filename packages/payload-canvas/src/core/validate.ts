// Layout validation without external libraries. Mirrors the JSON Schema from schema.ts, plus
// the rules a schema cannot express (unique ids). Optional props may be `null` (Payload's own
// "empty" value); the schema leaves that out to keep it simple for AI tools.

import { getBlockDefinition, slotLabel, slotLimitText } from './blocks'
import { conditionMet, readCondition } from './conditions'
import { formatProblem } from './formats'
import { dataFields, fieldBlocks, hasStaticDefault, optionValues, type DataField, type LooseField } from './fields'
import { isPlainObject } from './tree'
import { motionProblems } from './motion'
import { fallbackChain, localizedKeys } from './locale'
import type { BlockDefinition, LocaleSettings, SlotDefinition } from './types'

/**
 * - `invalid`: blocks every save (wrong shape or type: a layout no renderer can trust).
 * - `required` (a required prop is empty), `format` (a text prop does not match its
 *   `admin.custom.builderFormat`, such as a half-typed video URL), `constraint` (a value outside the
 *   field's limits: `minLength`/`maxLength`, `min`/`max`, `minRows`/`maxRows`, an email address
 *   without "@", or a slot with fewer blocks than its `min` or more than its `max`), `validate` (the field's own `validate` function returned a message), `nesting`
 *   (a block in a slot that refuses it) and `binding` (a binding the prop cannot use): block only
 *   publishing. Each of them can be true while someone is still typing, so drafts, autosave and
 *   live sessions keep saving unfinished work.
 * - `unknown-prop`, `unknown-key`: warnings, never blocking.
 */
export type LayoutErrorCode =
  | 'invalid'
  | 'required'
  | 'format'
  | 'constraint'
  | 'validate'
  | 'nesting'
  | 'binding'
  | 'unknown-prop'
  | 'unknown-key'

/**
 * `locale`: the problem is in that locale's own values (a translation), not the default locale's.
 * `path` still names the prop below `.props.`, so path readers work the same for every locale.
 */
export type LayoutError = { blockId?: string; path: string; message: string; code: LayoutErrorCode; locale?: string }

export type ValidateOptions = {
  /**
   * The document's locales. With them, a locale without fallback (`fallback: false`) must fill
   * every required localized prop too. Without them, translations are still checked by type.
   */
  localization?: LocaleSettings | null
}

/** Codes that block publishing but not draft saves. */
export const PUBLISH_ONLY_CODES: ReadonlySet<LayoutErrorCode> = new Set(['required', 'format', 'constraint', 'validate', 'nesting', 'binding'])

/** True when the error never blocks a save (only logged or shown). */
export function isLayoutWarning(error: Pick<LayoutError, 'code'>): boolean {
  return error.code === 'unknown-prop' || error.code === 'unknown-key'
}

/** True when the error blocks this save: everything but warnings, and publish-only codes only when publishing. */
export function isBlockingError(error: Pick<LayoutError, 'code'>, publishing: boolean): boolean {
  if (isLayoutWarning(error)) return false
  return publishing || !PUBLISH_ONLY_CODES.has(error.code)
}

const BLOCK_KEYS = new Set(['id', 'type', 'props', 'className', 'slots', 'bindings', 'hidden', 'label', 'locales', 'motion'])

/** Checks structure, unique ids, known block types, slot rules and prop types. */
export function validateLayout(layout: unknown, blocks: BlockDefinition[], options: ValidateOptions = {}): LayoutError[] {
  const errors: LayoutError[] = []
  if (!isPlainObject(layout)) return [{ path: '', message: 'Layout must be an object', code: 'invalid' }]
  if (layout.version !== 1) errors.push({ path: 'version', message: 'version must be 1', code: 'invalid' })
  if (!Array.isArray(layout.blocks)) {
    errors.push({ path: 'blocks', message: 'blocks must be an array', code: 'invalid' })
    return errors
  }
  const seen = new Set<string>()
  const localization = options.localization ?? null
  layout.blocks.forEach((block, i) => checkBlock(block, `blocks[${i}]`, null, [], blocks, seen, errors, localization))
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
  localization: LocaleSettings | null,
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
  if (type && def?.parents && !(owner && def.parents.includes(owner.type))) {
    const parents = def.parents.map((t) => getBlockDefinition(blocks, t)?.label ?? t).join(' or ')
    report(path, `${typeLabel} can only go inside ${parents}`, 'nesting')
  }
  const refusedBy = type ? banned.find((b) => b.type === type) : undefined
  if (refusedBy) report(path, `${typeLabel} cannot go inside ${refusedBy.by}`, 'nesting')

  if (value.props !== undefined && !isPlainObject(value.props)) {
    report(`${path}.props`, 'props must be an object')
  } else if (def) {
    checkFields(def.fields as unknown[], value.props ?? {}, `${path}.props`, report)
  }
  if (value.locales !== undefined) {
    if (!isPlainObject(value.locales) || !Object.values(value.locales).every(isPlainObject)) {
      report(`${path}.locales`, 'locales must be an object of props per locale')
    } else if (def) {
      checkLocales(def, value.locales as Record<string, Record<string, unknown>>, isPlainObject(value.props) ? value.props : {}, path, blockId, errors, localization)
    }
  }
  if (def && localization) checkMissingRequired(def, value, path, blockId, errors, localization)

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
  for (const problem of motionProblems(value.motion)) {
    report(`${path}.${problem.path}`, problem.message, problem.unknown ? 'unknown-key' : 'invalid')
  }
  if (value.bindings !== undefined) {
    if (!isPlainObject(value.bindings)) report(`${path}.bindings`, 'bindings must be an object')
    else {
      for (const [key, target] of Object.entries(value.bindings)) {
        if (typeof target !== 'string') report(`${path}.bindings.${key}`, 'A binding must be a field path string')
      }
    }
  }

  if (def?.slots) checkSlotCounts(def, isPlainObject(value.slots) ? value.slots : {}, path, report)

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
    children.forEach((child, i) => checkBlock(child, `${slotPath}[${i}]`, childOwner, childBanned, blocks, seen, errors, localization))
  }
}

type Report = (path: string, message: string, code?: LayoutErrorCode) => void

/**
 * A slot's `min` and `max` (Payload's `minRows`/`maxRows`): publish-only `constraint` problems,
 * because a slot may be short of blocks while someone is still building it. A slot with no key
 * holds 0 blocks.
 */
function checkSlotCounts(def: BlockDefinition, slots: Record<string, unknown>, path: string, report: Report): void {
  for (const [name, slot] of Object.entries(def.slots ?? {})) {
    const list = slots[name]
    const count = Array.isArray(list) ? list.length : 0
    const label = `"${slotLabel(def, name)}"`
    if (typeof slot.min === 'number' && count < slot.min) report(`${path}.slots.${name}`, `${label} ${slotLimitText('min', slot.min)}`, 'constraint')
    if (typeof slot.max === 'number' && count > slot.max) report(`${path}.slots.${name}`, `${label} ${slotLimitText('max', slot.max)}`, 'constraint')
  }
}

/**
 * The own values of each locale: only localized props, with the same checks as the default
 * locale's values. Their paths name the prop under `.props.` and the error carries the locale.
 * An empty own value of a required prop fails only in a locale without fallback.
 */
function checkLocales(
  def: BlockDefinition,
  locales: Record<string, Record<string, unknown>>,
  props: Record<string, unknown>,
  path: string,
  blockId: string | undefined,
  errors: LayoutError[],
  localization: LocaleSettings | null,
): void {
  const keys = localizedKeys(def)
  const list = dataFields(def.fields as unknown[])
  for (const [locale, values] of Object.entries(locales)) {
    const report: Report = (at, message, code = 'invalid') => errors.push({ ...(blockId ? { blockId } : {}), path: at, message, code, locale })
    if (localization && !localization.locales.includes(locale)) {
      report(`${path}.locales.${locale}`, `Unknown locale "${locale}"`, 'unknown-key')
      continue
    }
    if (localization?.defaultLocale === locale) {
      report(`${path}.locales.${locale}`, `"${locale}" is the default locale: its values belong in props`, 'unknown-key')
      continue
    }
    // Conditions read the locale's view of the block: its own values over the shared props.
    const siblings = { ...props, ...values }
    // With a fallback, an empty own value shows the fallback's value (Payload's read rule).
    const fallsBack = !localization || fallbackChain(localization, locale).length > 0
    for (const [key, value] of Object.entries(values)) {
      const at = `${path}.props.${key}`
      const field = list.find((f) => f.name === key)
      if (!field || !keys.has(key)) {
        if (value !== undefined) report(at, field ? `"${key}" is not localized` : `Unknown prop "${key}"`, 'unknown-prop')
        continue
      }
      if (isEmpty(value)) {
        if (field.required && !fallsBack && shown(field, siblings, list)) report(at, `"${field.name}" is required`, 'required')
        if (value === undefined || value === null) continue
      }
      checkValue(field, value, at, report)
      checkFormat(field, value, siblings, list, at, report)
    }
  }
}

/**
 * Locales without fallback (`fallback: false`, or a request-free config with no fallback for the
 * locale) show nothing for a missing value, so every required localized prop needs its own value
 * there, as in Payload. With fallback, a missing value shows the fallback's value: nothing to report.
 */
function checkMissingRequired(
  def: BlockDefinition,
  value: Record<string, unknown>,
  path: string,
  blockId: string | undefined,
  errors: LayoutError[],
  localization: LocaleSettings,
): void {
  const keys = localizedKeys(def)
  if (keys.size === 0) return
  const props = isPlainObject(value.props) ? value.props : {}
  const locales = isPlainObject(value.locales) ? value.locales : {}
  const list = dataFields(def.fields as unknown[])
  for (const locale of localization.locales) {
    if (locale === localization.defaultLocale || fallbackChain(localization, locale).length > 0) continue
    const own = isPlainObject(locales[locale]) ? locales[locale] : {}
    const siblings = { ...props, ...own }
    for (const field of list) {
      if (!field.required || !keys.has(field.name) || Object.hasOwn(own, field.name)) continue
      if (!shown(field, siblings, list)) continue
      errors.push({ ...(blockId ? { blockId } : {}), path: `${path}.props.${field.name}`, message: `"${field.name}" is required`, code: 'required', locale })
    }
  }
}

/** False when the field's `builderCondition` hides it in the editor. */
function shown(field: DataField, siblings: Record<string, unknown>, siblingFields: readonly DataField[]): boolean {
  const condition = readCondition(field)
  return !condition || conditionMet(condition, siblings, siblingFields)
}

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
    const stored = data[field.name]
    // A field that is not there renders its default (`withFieldDefaults`), so it is checked as that.
    // A cleared value (`null`, `''`) stays empty.
    const value = stored === undefined && hasStaticDefault(field) ? field.defaultValue : stored
    const at = `${path}.${field.name}`
    if (isEmpty(value)) {
      if (field.required) {
        // A field its condition hides is not required (Payload skips hidden fields too).
        if (shown(field, data, list)) report(at, `"${field.name}" is required`, 'required')
        continue
      }
      if (value === undefined || value === null) continue
    }
    checkValue(field, value, at, report)
    checkFormat(field, value, data, list, at, report)
  }
}

/**
 * A text prop with `admin.custom.builderFormat` must match that format (publish only). A prop
 * the editor hides (`builderCondition` not met by a sibling that has a value) is not checked,
 * because a leftover value there is never shown or rendered.
 */
function checkFormat(
  field: DataField,
  value: unknown,
  siblings: Record<string, unknown>,
  siblingFields: readonly DataField[],
  path: string,
  report: Report,
): void {
  const custom = field.admin?.custom
  if (field.type !== 'text' || field.hasMany || typeof value !== 'string' || !custom) return
  // Skipped only when the sibling has a value that hides the prop; with no value it is checked.
  const condition = readCondition(field)
  const sibling = condition ? siblings[condition.field] : undefined
  if (condition && sibling !== undefined && sibling !== null && !conditionMet(condition, siblings, siblingFields)) return
  const problem = formatProblem(custom.builderFormat, value)
  if (problem) report(path, problem, 'format')
}

function checkMany(field: LooseField, value: unknown, path: string, report: Report, item: (v: unknown, at: string) => void): void {
  if (!Array.isArray(value)) {
    report(path, 'Must be an array')
    return
  }
  if (typeof field.minRows === 'number' && value.length < field.minRows) report(path, `Must have at least ${field.minRows} items`, 'constraint')
  if (typeof field.maxRows === 'number' && value.length > field.maxRows) report(path, `Must have at most ${field.maxRows} items`, 'constraint')
  value.forEach((v, i) => item(v, `${path}[${i}]`))
}

function checkString(field: LooseField, value: unknown, path: string, report: Report): void {
  if (typeof value !== 'string') return report(path, 'Must be a string')
  if (typeof field.minLength === 'number' && value.length < field.minLength) report(path, `Must be at least ${field.minLength} characters`, 'constraint')
  if (typeof field.maxLength === 'number' && value.length > field.maxLength) report(path, `Must be at most ${field.maxLength} characters`, 'constraint')
}

function checkNumber(field: LooseField, value: unknown, path: string, report: Report): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return report(path, 'Must be a number')
  if (typeof field.min === 'number' && value < field.min) report(path, `Must be at least ${field.min}`, 'constraint')
  if (typeof field.max === 'number' && value > field.max) report(path, `Must be at most ${field.max}`, 'constraint')
}

/** Payload's default email check (`payload/fields/validations`, email). */
const EMAIL = /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

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
    case 'code':
      return checkString(field, value, path, report)
    case 'email':
      checkString(field, value, path, report)
      // Payload's own email check: something@something.
      if (typeof value === 'string' && value !== '' && !EMAIL.test(value)) report(path, 'Must be a valid email address', 'constraint')
      return
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
