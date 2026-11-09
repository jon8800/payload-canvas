// Form field edits for AI agents: the MCP tools (mcp/forms.ts) and the editor's assistant
// (ai/tools.ts). An agent names fields by their `name` (or block id) and sends small changes
// ("add an email field", "make phone required", "show company only when topic is sales").
// `formFieldOps` turns them into the builder's normal operations, so they reach the form's live
// session like any editor change, and an open form builder shows them at once.
// Pure: no Payload, no I/O.

import { isRichText, plainToRichText, richTextToPlain } from '../core/bindings'
import { dataFields } from '../core/fields'
import { createId } from '../core/ids'
import { isPlainObject } from '../core/tree'
import type { Block, BlockDefinition, Layout, Operation } from '../core/types'
import { describeConditions, FORM_CONDITION_OPERATORS, FORM_CONDITIONS_FIELD, type FormConditionOperator, type FormFieldConditions } from './conditions'
import { formFieldSlug, formFieldType } from './blocks'

/** The format guide for agents: field types, props and display conditions. */
export const FORM_FIELDS_GUIDE = [
  'FORM FIELDS. A form is a list of fields, shown in order. Each field has a `type` and props:',
  '- name (text, required): the key of the answer in a submission. Letters, digits and _ only, unique in the form (e.g. "email", "company_size").',
  '- label (text): the question people see. required (boolean): the form refuses to send without an answer.',
  '- width (number, percent of the row, e.g. 50 puts two fields side by side; empty = 100). placeholder (text, where the type has it).',
  '- defaultValue: text for text-like fields, a number for "number", true/false for "checkbox".',
  '- options (select, radio): [{ label, value }]. You may send plain strings; each becomes { label, value } with a value made from the label.',
  '- message ("message" type only): text shown between the fields. Send plain text (one paragraph per line); it is stored as rich text. A message has no name and collects no answer.',
  'Types (the form\'s `fieldTypes` lists the ones this site has and their props): text (one line), email (checks the address), textarea (long text), number, select (dropdown), radio, checkbox (true/false, e.g. accept the terms), country, state (US states), date, message, upload, payment.',
  `DISPLAY CONDITIONS. A field may show only when other fields have some values: conditions = { match: "all" | "any", rules: [{ field, operator, value }] }. field = the name of another field of the same form. operator: ${FORM_CONDITION_OPERATORS.join(', ')}. value is text, needed for equals, notEquals and contains (a checkbox compares with "true" or "false"). Text compares without case. match "all" (default) needs every rule, "any" one rule. A hidden field is never required, and its answer is not sent. A rule that reads a hidden field sees it as empty. null or no rules: the field always shows.`,
  'Example: show "company" only when "topic" equals "sales": { "action": "setConditions", "field": "company", "conditions": { "rules": [{ "field": "topic", "operator": "equals", "value": "sales" }] } }.',
].join('\n')

/** One field of a form, as agents read it. */
export type FormFieldView = {
  id: string
  type: string
  name?: string
  label?: string
  required?: boolean
  width?: number
  placeholder?: string
  defaultValue?: unknown
  options?: unknown
  /** "message" fields: the text. */
  message?: string
  conditions?: FormFieldConditions
  /** The conditions in one sentence: "Shows when Topic equals “sales”". */
  shows?: string
  /** Any other props the field type has. */
  [key: string]: unknown
}

/** One change of a form's fields. `field` is the field's name or its id. */
export type FormFieldChange =
  | { action: 'add'; type: string; values?: Record<string, unknown>; index?: number }
  | { action: 'update'; field: string; values?: Record<string, unknown>; unset?: string[] }
  | { action: 'move'; field: string; index: number }
  | { action: 'remove'; field: string }
  | { action: 'setConditions'; field: string; conditions: FormFieldConditions | null }

const KNOWN_KEYS = new Set(['id', 'type'])

/** The fields of a form layout (the decoded `fields` blocks), in order. */
export function formFieldsOf(layout: Layout): FormFieldView[] {
  return layout.blocks.map((block) => formFieldView(block, layout.blocks))
}

function formFieldView(block: Block, all: readonly Block[]): FormFieldView {
  const props = (block.props ?? {}) as Record<string, unknown>
  const out: FormFieldView = { id: block.id, type: formFieldSlug(block.type) ?? block.type }
  for (const [key, value] of Object.entries(props)) {
    if (KNOWN_KEYS.has(key) || value === null || value === undefined || value === '') continue
    if (key === 'message') {
      out.message = isRichText(value) ? richTextToPlain(value) : String(value)
      continue
    }
    if (key === FORM_CONDITIONS_FIELD) {
      const conditions = cleanConditions(value)
      if (!conditions) continue
      out.conditions = conditions
      const labels = new Map(all.map((b) => [String(b.props?.name ?? ''), String(b.props?.label ?? b.props?.name ?? '')]))
      const shows = describeConditions({ conditions }, (name) => labels.get(name) || name)
      if (shows) out.shows = shows
      continue
    }
    if (Array.isArray(value)) {
      // Array rows keep their values, without Payload's row ids.
      out[key] = value.map((row) => (isPlainObject(row) ? Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id')) : row))
      continue
    }
    out[key] = value
  }
  return out
}

/** Conditions with rules, without row ids. Null when there is no rule. */
function cleanConditions(value: unknown): FormFieldConditions | null {
  if (!isPlainObject(value)) return null
  const rules = Array.isArray(value.rules)
    ? value.rules.filter(isPlainObject).map((rule) => ({
        field: typeof rule.field === 'string' ? rule.field : null,
        operator: (typeof rule.operator === 'string' ? rule.operator : 'equals') as FormConditionOperator,
        ...(typeof rule.value === 'string' && rule.value !== '' ? { value: rule.value } : {}),
      }))
    : []
  if (rules.length === 0) return null
  return { ...(value.match === 'any' ? { match: 'any' as const } : {}), rules }
}

/** The field types a form offers, with their props, for agents. */
export function formFieldTypes(definitions: readonly BlockDefinition[]) {
  return definitions.flatMap((def) => {
    const slug = formFieldSlug(def.type)
    if (!slug) return []
    const props = dataFields(def.fields as unknown[])
      .filter((f) => f.name !== FORM_CONDITIONS_FIELD)
      .map((f) => ({ name: f.name, type: f.type, ...(f.required ? { required: true } : {}) }))
    return [{ type: slug, label: def.label, ...(def.description ? { description: def.description } : {}), props }]
  })
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Lowercase ASCII words of a label joined by `separator`, at most 40 characters ("Été 2026" -> "ete_2026"). */
function slugOf(label: string, separator: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .slice(0, 40)
    .split(separator)
    .filter(Boolean)
    .join(separator)
}

/** A field name made from a label: "Company size" -> "company_size". */
export function nameFromLabel(label: string): string {
  const base = slugOf(label, '_')
  return base === '' ? 'field' : /^\d/.test(base) ? `field_${base}` : base
}

/** `base`, else `base2`, `base3`, … : the first name no field has. */
function freeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}

/** An option value made from its label: "Not sure" -> "not-sure", "5k to 20k" -> "5k-to-20k". */
const optionValue = (label: string) => slugOf(label, '-') || 'option'

/** The values with the shapes agents send fixed: options as strings, a message as plain text, conditions. */
function normalizeValues(values: Record<string, unknown>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (key === 'id' || key === 'blockType' || key === 'type') continue
    if (key === 'options' && Array.isArray(value)) {
      out.options = value.map((option) => {
        if (typeof option === 'string') return { label: option, value: optionValue(option) }
        if (isPlainObject(option) && typeof option.label === 'string' && (option.value === undefined || option.value === '')) {
          return { ...option, value: optionValue(option.label) }
        }
        return option
      })
      continue
    }
    if (key === 'message' && typeof value === 'string') {
      out.message = plainToRichText(value)
      continue
    }
    if (key === FORM_CONDITIONS_FIELD) {
      const conditions = conditionsValue(value)
      if (typeof conditions === 'string') return conditions
      out[key] = conditions
      continue
    }
    if (key === 'width' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      out.width = Number(value)
      continue
    }
    out[key] = value
  }
  return out
}

/** Checks the conditions' shape. Null clears them. */
function conditionsValue(value: unknown): FormFieldConditions | null | string {
  if (value === null || value === undefined) return null
  if (!isPlainObject(value)) return '`conditions` must be { match?, rules: [{ field, operator, value? }] } or null.'
  if (value.match !== undefined && value.match !== null && value.match !== 'all' && value.match !== 'any') return '`conditions.match` must be "all" or "any".'
  const rules = value.rules ?? []
  if (!Array.isArray(rules)) return '`conditions.rules` must be a list.'
  const out = []
  for (const [i, rule] of rules.entries()) {
    if (!isPlainObject(rule) || typeof rule.field !== 'string' || !rule.field.trim()) return `Rule ${i + 1} needs \`field\`: the name of another field.`
    const operator = rule.operator ?? 'equals'
    if (typeof operator !== 'string' || !(FORM_CONDITION_OPERATORS as readonly string[]).includes(operator)) {
      return `Rule ${i + 1}: \`operator\` must be one of ${FORM_CONDITION_OPERATORS.join(', ')}.`
    }
    const needsValue = operator === 'equals' || operator === 'notEquals' || operator === 'contains'
    if (needsValue && (rule.value === undefined || rule.value === null)) return `Rule ${i + 1}: "${operator}" needs a \`value\`.`
    out.push({ field: rule.field.trim(), operator: operator as (typeof FORM_CONDITION_OPERATORS)[number], ...(needsValue ? { value: String(rule.value) } : {}) })
  }
  if (out.length === 0) return null
  return { match: value.match === 'any' ? 'any' : 'all', rules: out }
}

export type FormFieldOpsResult = { ok: true; ops: Operation[]; notes: string[] } | { ok: false; error: string }

/**
 * The builder operations for a list of field changes, applied in order (each change sees the
 * ones before it). `definitions` are the form's field block definitions: they give the types and
 * the start values of a new field. Checks names (unique, valid) and conditions (rules name other
 * fields). Renaming a field rewrites the rules that read it. The operations themselves are checked
 * again by the live session (prop types, required props on publish).
 */
export function formFieldOps(layout: Layout, changes: readonly FormFieldChange[], definitions: readonly BlockDefinition[]): FormFieldOpsResult {
  // A working list: id, type and props of each field, so later changes see earlier ones.
  let fields = layout.blocks.map((b) => ({ id: b.id, type: b.type, props: { ...b.props } as Record<string, unknown> }))
  const ops: Operation[] = []
  const notes: string[] = []
  const ids = new Set(fields.map((f) => f.id))
  const nameOf = (f: (typeof fields)[number]) => (typeof f.props.name === 'string' ? f.props.name : '')
  const find = (ref: unknown) => {
    if (typeof ref !== 'string' || !ref) return undefined
    return fields.find((f) => f.id === ref) ?? fields.find((f) => nameOf(f) === ref)
  }
  const missing = (ref: unknown, i: number) =>
    `Change ${i + 1}: there is no field "${String(ref)}". Fields: ${fields.map((f) => nameOf(f) || f.id).join(', ') || 'none'}.`
  const checkRules = (conditions: unknown, self: string, i: number): string | null => {
    if (!isPlainObject(conditions) || !Array.isArray(conditions.rules)) return null
    for (const rule of conditions.rules as Array<{ field: string }>) {
      if (rule.field === self) return `Change ${i + 1}: a field cannot depend on itself ("${self}").`
      if (!fields.some((f) => nameOf(f) === rule.field)) return `Change ${i + 1}: the rule names "${rule.field}", which is not a field of this form.`
    }
    return null
  }

  for (const [i, change] of changes.entries()) {
    if (!isPlainObject(change)) return { ok: false, error: `Change ${i + 1} must be an object.` }
    switch (change.action) {
      case 'add': {
        const blockType = typeof change.type === 'string' ? (formFieldSlug(change.type) ? change.type : formFieldType(change.type)) : ''
        const def = definitions.find((d) => d.type === blockType)
        if (!def) {
          const known = definitions.map((d) => formFieldSlug(d.type)).filter(Boolean)
          return { ok: false, error: `Change ${i + 1}: unknown field type "${String(change.type)}". This form offers: ${known.join(', ')}.` }
        }
        const values = normalizeValues(isPlainObject(change.values) ? change.values : {})
        if (typeof values === 'string') return { ok: false, error: `Change ${i + 1}: ${values}` }
        const named = dataFields(def.fields as unknown[]).some((f) => f.name === 'name')
        const props: Record<string, unknown> = {}
        // The type's start values (a label, and `name`), as the editor's insert gives them.
        for (const f of dataFields(def.fields as unknown[])) if (f.defaultValue !== undefined && typeof f.defaultValue !== 'function') props[f.name] = f.defaultValue
        Object.assign(props, values)
        if (named) {
          const taken = new Set(fields.map(nameOf).filter(Boolean))
          if (typeof values.name === 'string') {
            if (!NAME.test(values.name)) return { ok: false, error: `Change ${i + 1}: the name "${values.name}" must use letters, digits and _ only.` }
            if (taken.has(values.name)) return { ok: false, error: `Change ${i + 1}: another field is already named "${values.name}". Names must be unique.` }
          } else {
            const base = typeof values.label === 'string' && values.label.trim() ? nameFromLabel(values.label) : (formFieldSlug(def.type) ?? 'field')
            props.name = freeName(base, taken)
          }
        }
        const problem = checkRules(props[FORM_CONDITIONS_FIELD], String(props.name ?? ''), i)
        if (problem) return { ok: false, error: problem }
        let id = createId()
        while (ids.has(id)) id = createId()
        ids.add(id)
        const index = typeof change.index === 'number' && Number.isInteger(change.index) ? Math.max(0, Math.min(change.index, fields.length)) : fields.length
        const clean = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined))
        ops.push({ type: 'insert', block: { id, type: def.type, props: clean }, to: { parentId: null, slot: 'children', index } })
        fields = [...fields.slice(0, index), { id, type: def.type, props: clean }, ...fields.slice(index)]
        if (!named) break
        notes.push(`Added "${String(clean.name)}" (${formFieldSlug(def.type)}) with id ${id}.`)
        break
      }
      case 'update': {
        const field = find(change.field)
        if (!field) return { ok: false, error: missing(change.field, i) }
        const values = normalizeValues(isPlainObject(change.values) ? change.values : {})
        if (typeof values === 'string') return { ok: false, error: `Change ${i + 1}: ${values}` }
        const unset = Array.isArray(change.unset) ? change.unset.filter((k): k is string => typeof k === 'string' && k !== 'name') : []
        const oldName = nameOf(field)
        if ('name' in values) {
          const next = values.name
          if (typeof next !== 'string' || !NAME.test(next)) return { ok: false, error: `Change ${i + 1}: the name must use letters, digits and _ only.` }
          if (next !== oldName && fields.some((f) => f !== field && nameOf(f) === next)) return { ok: false, error: `Change ${i + 1}: another field is already named "${next}".` }
        }
        if (FORM_CONDITIONS_FIELD in values) {
          const problem = checkRules(values[FORM_CONDITIONS_FIELD], typeof values.name === 'string' ? values.name : oldName, i)
          if (problem) return { ok: false, error: problem }
        }
        const props = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
        if (Object.keys(props).length === 0 && unset.length === 0) return { ok: false, error: `Change ${i + 1}: \`values\` or \`unset\` is needed.` }
        ops.push({ type: 'update', id: field.id, ...(Object.keys(props).length > 0 ? { props } : {}), ...(unset.length > 0 ? { unsetProps: unset } : {}) })
        field.props = { ...field.props, ...props }
        for (const key of unset) delete field.props[key]
        // A rename: rules that read the old name now read the new one.
        const newName = nameOf(field)
        if (oldName && newName !== oldName) {
          for (const other of fields) {
            const conditions = other.props[FORM_CONDITIONS_FIELD]
            if (other === field || !isPlainObject(conditions) || !Array.isArray(conditions.rules)) continue
            if (!conditions.rules.some((r) => isPlainObject(r) && r.field === oldName)) continue
            const next = { ...conditions, rules: conditions.rules.map((r) => (isPlainObject(r) && r.field === oldName ? { ...r, field: newName } : r)) }
            ops.push({ type: 'update', id: other.id, props: { [FORM_CONDITIONS_FIELD]: next } })
            other.props = { ...other.props, [FORM_CONDITIONS_FIELD]: next }
            notes.push(`The conditions of "${nameOf(other)}" now read "${newName}".`)
          }
        }
        break
      }
      case 'move': {
        const field = find(change.field)
        if (!field) return { ok: false, error: missing(change.field, i) }
        if (typeof change.index !== 'number' || !Number.isInteger(change.index) || change.index < 0) return { ok: false, error: `Change ${i + 1}: \`index\` must be a whole number from 0.` }
        const rest = fields.filter((f) => f !== field)
        const index = Math.min(change.index, rest.length)
        ops.push({ type: 'move', id: field.id, to: { parentId: null, slot: 'children', index } })
        fields = [...rest.slice(0, index), field, ...rest.slice(index)]
        break
      }
      case 'remove': {
        const field = find(change.field)
        if (!field) return { ok: false, error: missing(change.field, i) }
        ops.push({ type: 'remove', id: field.id })
        fields = fields.filter((f) => f !== field)
        const name = nameOf(field)
        const readers = name
          ? fields.filter((f) => {
              const c = f.props[FORM_CONDITIONS_FIELD]
              return isPlainObject(c) && Array.isArray(c.rules) && c.rules.some((r) => isPlainObject(r) && r.field === name)
            })
          : []
        if (readers.length > 0) notes.push(`Rules of ${readers.map((f) => `"${nameOf(f)}"`).join(', ')} still read "${name}", which is gone: such a rule sees an empty value. Change or clear them with setConditions.`)
        break
      }
      case 'setConditions': {
        const field = find(change.field)
        if (!field) return { ok: false, error: missing(change.field, i) }
        const conditions = conditionsValue(change.conditions)
        if (typeof conditions === 'string') return { ok: false, error: `Change ${i + 1}: ${conditions}` }
        const problem = checkRules(conditions, nameOf(field), i)
        if (problem) return { ok: false, error: problem }
        // No rules: the group stays, empty, as Payload's form leaves it.
        const value = conditions ?? { match: 'all', rules: [] }
        ops.push({ type: 'update', id: field.id, props: { [FORM_CONDITIONS_FIELD]: value } })
        field.props = { ...field.props, [FORM_CONDITIONS_FIELD]: value }
        break
      }
      default:
        return { ok: false, error: `Change ${i + 1}: \`action\` must be add, update, move, remove or setConditions.` }
    }
  }
  return { ok: true, ops, notes }
}
