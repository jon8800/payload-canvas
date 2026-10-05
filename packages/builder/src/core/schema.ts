// JSON Schema (draft 2020-12) generated from block definitions and their Payload field configs.
// AI tools read these schemas to write layouts, so they must match what validateLayout accepts.

import { slotAccepts } from './blocks'
import { dataFields, fieldBlocks, optionValues, textOf, type DataField, type LooseField } from './fields'
import { isPlainObject } from './tree'
import type { BlockDefinition, SlotDefinition } from './types'

type Schema = Record<string, unknown>

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'
const ID: Schema = { type: ['string', 'number'] }

/** JSON Schema (draft 2020-12) for one block, generated from its Payload field configs. */
export function blockJsonSchema(def: BlockDefinition, all: BlockDefinition[]): Record<string, unknown> {
  const defs = defsFor(reachableTypes(def, all), all)
  return {
    $schema: DRAFT,
    ...blockSchema(def, all),
    ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
  }
}

/** JSON Schema for a whole Layout with the given blocks. */
export function layoutJsonSchema(blocks: BlockDefinition[]): Record<string, unknown> {
  return {
    $schema: DRAFT,
    title: 'Layout',
    description:
      'A page layout: a tree of blocks. Every block id must be unique in the layout. ' +
      'Child blocks go in `slots`, keyed by slot name.',
    type: 'object',
    properties: {
      version: { const: 1 },
      blocks: { type: 'array', items: blockRefs(rootTypes(blocks)) },
    },
    required: ['version', 'blocks'],
    additionalProperties: false,
    $defs: defsFor(
      blocks.map((b) => b.type),
      blocks,
    ),
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function ref(type: string): Schema {
  const pointer = type.replaceAll('~', '~0').replaceAll('/', '~1')
  return { $ref: `#/$defs/${encodeURIComponent(pointer)}` }
}

function blockRefs(types: string[]): Schema {
  if (types.length === 1) return ref(types[0])
  return { oneOf: types.map(ref) }
}

/** Types a slot of `owner` accepts as direct children: its `allow`/`disallow` and each type's `parents`. */
function allowedTypes(owner: string, slot: SlotDefinition, all: BlockDefinition[]): string[] {
  return all.filter((b) => slotAccepts(slot, b.type) && (!b.parents || b.parents.includes(owner))).map((b) => b.type)
}

/** Types the root list accepts: every type without a `parents` rule. */
const rootTypes = (all: BlockDefinition[]) => all.filter((b) => !b.parents).map((b) => b.type)

/** Every block type that can appear inside `def`, at any depth. May include `def` itself. */
function reachableTypes(def: BlockDefinition, all: BlockDefinition[]): string[] {
  const found = new Set<string>()
  const queue = [def]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const slot of Object.values(current?.slots ?? {})) {
      for (const type of allowedTypes(current?.type ?? '', slot, all)) {
        if (found.has(type)) continue
        found.add(type)
        const next = all.find((b) => b.type === type)
        if (next) queue.push(next)
      }
    }
  }
  return all.filter((b) => found.has(b.type)).map((b) => b.type)
}

function defsFor(types: string[], all: BlockDefinition[]): Schema {
  const defs: Schema = {}
  for (const type of types) {
    const def = all.find((b) => b.type === type)
    if (def) defs[type] = blockSchema(def, all)
  }
  return defs
}

function blockSchema(def: BlockDefinition, all: BlockDefinition[]): Schema {
  const properties: Schema = {
    id: { type: 'string', minLength: 1, description: 'Unique block id, e.g. "b_8f2k9x".' },
    type: { const: def.type },
    props: { ...objectSchema(def.fields as unknown[]), description: 'The block\'s field values.' },
  }
  if (def.styles !== false) {
    properties.className = {
      type: 'string',
      description: 'Tailwind classes, including variants such as "md:" and "hover:".',
    }
  }
  if (def.slots && Object.keys(def.slots).length > 0) {
    const slots: Schema = {}
    for (const [name, slot] of Object.entries(def.slots)) {
      const types = allowedTypes(def.type, slot, all)
      const label = slot.label ? `${slot.label}. ` : ''
      const refused = slot.disallow?.length ? ` Never put these anywhere inside it, at any depth: ${slot.disallow.join(', ')}.` : ''
      const limits = { ...(typeof slot.min === 'number' ? { minItems: slot.min } : {}), ...(typeof slot.max === 'number' ? { maxItems: slot.max } : {}) }
      const counts = [
        typeof slot.min === 'number' ? `at least ${slot.min}` : '',
        typeof slot.max === 'number' ? `at most ${slot.max}` : '',
      ].filter(Boolean)
      const countText = counts.length > 0 ? ` Holds ${counts.join(' and ')} ${slot.max === 1 && !slot.min ? 'block' : 'blocks'}.` : ''
      slots[name] =
        types.length > 0
          ? { type: 'array', description: `${label}Accepts: ${types.join(', ')}.${countText}${refused}`, items: blockRefs(types), ...limits }
          : { type: 'array', description: `${label}Accepts no known block types.`, maxItems: 0 }
    }
    properties.slots = {
      type: 'object',
      description: 'Child blocks by slot name.',
      properties: slots,
      additionalProperties: false,
    }
  }
  properties.bindings = {
    type: 'object',
    description: 'Prop path -> document field path. Bound props take the document\'s value at render time.',
    additionalProperties: { type: 'string' },
  }
  properties.hidden = { type: 'boolean', description: 'Hidden blocks stay in the data but do not render.' }
  properties.label = {
    type: 'string',
    description: 'Optional name for editors, shown in the outline (e.g. "Hero", "Pricing"). Never rendered on the site.',
  }

  const required = ['id', 'type']
  if (dataFields(def.fields as unknown[]).some((f) => f.required)) required.push('props')

  const schema: Schema = { title: def.label }
  if (def.ai?.description) schema.description = def.ai.description
  Object.assign(schema, { type: 'object', properties, required, additionalProperties: false })
  if (def.ai?.example) schema.examples = [{ id: 'b_example', type: def.type, ...def.ai.example }]
  return schema
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** An object schema for a list of fields. Exported for tests and other core modules. */
export function objectSchema(fields: readonly unknown[], extra: Schema = {}): Schema {
  const properties: Schema = { ...extra }
  const required: string[] = []
  for (const field of dataFields(fields)) {
    properties[field.name] = fieldSchema(field)
    if (field.required) required.push(field.name)
  }
  const schema: Schema = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  schema.additionalProperties = false
  return schema
}

function many(field: LooseField, item: Schema): Schema {
  const schema: Schema = { type: 'array', items: item }
  if (typeof field.minRows === 'number') schema.minItems = field.minRows
  if (typeof field.maxRows === 'number') schema.maxItems = field.maxRows
  return schema
}

function stringSchema(field: LooseField, extra: Schema = {}): Schema {
  const schema: Schema = { type: 'string', ...extra }
  if (typeof field.minLength === 'number') schema.minLength = field.minLength
  if (typeof field.maxLength === 'number') schema.maxLength = field.maxLength
  return schema
}

function relationSchema(field: LooseField): { schema: Schema; hint: string } {
  const to = field.relationTo
  if (Array.isArray(to)) {
    const item: Schema = {
      type: 'object',
      properties: { relationTo: { enum: to }, value: ID },
      required: ['relationTo', 'value'],
      additionalProperties: false,
    }
    const hint = `Reference as { relationTo, value } where relationTo is one of: ${to.map((c) => `"${c}"`).join(', ')} and value is the document ID.`
    return { schema: field.hasMany ? many(field, item) : item, hint }
  }
  const hint = field.hasMany
    ? `IDs of documents in the "${to}" collection.`
    : `ID of a document in the "${to}" collection.`
  return { schema: field.hasMany ? many(field, ID) : ID, hint }
}

function typeSchema(field: DataField): { schema: Schema; hint?: string } {
  switch (field.type) {
    case 'text': {
      const item = stringSchema(field)
      return { schema: field.hasMany ? many(field, item) : item }
    }
    case 'textarea':
    case 'code':
      return { schema: stringSchema(field) }
    case 'email':
      return { schema: stringSchema(field, { format: 'email' }) }
    case 'number': {
      const item: Schema = { type: 'number' }
      if (typeof field.min === 'number') item.minimum = field.min
      if (typeof field.max === 'number') item.maximum = field.max
      return { schema: field.hasMany ? many(field, item) : item }
    }
    case 'checkbox':
      return { schema: { type: 'boolean' } }
    case 'select':
    case 'radio': {
      const item: Schema = { type: 'string', enum: optionValues(field) }
      if (field.type === 'select' && field.hasMany) return { schema: { ...many(field, item), uniqueItems: true } }
      return { schema: item }
    }
    case 'date':
      return { schema: { type: 'string', format: 'date-time' }, hint: 'ISO 8601 date-time string.' }
    case 'upload':
    case 'relationship':
      return relationSchema(field)
    case 'richText':
      return {
        schema: {
          type: 'object',
          properties: { root: { type: 'object' } },
          required: ['root'],
        },
        hint: 'Lexical rich text JSON: { root: { type: "root", children: [...] } }.',
      }
    case 'json':
      return { schema: isPlainObject(field.jsonSchema?.schema) ? { ...field.jsonSchema.schema } : {} }
    case 'point':
      return {
        schema: {
          type: 'array',
          prefixItems: [{ type: 'number' }, { type: 'number' }],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
        hint: '[longitude, latitude].',
      }
    case 'group':
      return { schema: objectSchema(field.fields ?? []) }
    case 'array':
      return { schema: many(field, objectSchema(field.fields ?? [], { id: { type: 'string' } })) }
    case 'blocks': {
      const variants = fieldBlocks(field).map((b) =>
        objectSchema(b.fields, {
          id: { type: 'string' },
          blockName: { type: 'string' },
          blockType: { const: b.slug },
        }),
      )
      for (const variant of variants) variant.required = ['blockType', ...((variant.required as string[]) ?? [])]
      return { schema: many(field, variants.length === 1 ? variants[0] : { oneOf: variants }) }
    }
    default:
      return { schema: {} }
  }
}

function fieldSchema(field: DataField): Schema {
  const { schema, hint } = typeSchema(field)
  const out: Schema = {}
  const title = textOf(field.label)
  if (title) out.title = title
  const description = [textOf(field.ai?.description), textOf(field.custom?.ai?.description), textOf(field.admin?.description), hint]
    .filter((text): text is string => Boolean(text))
    .join(' ')
  if (description) out.description = description
  Object.assign(out, schema)
  // validateLayout treats "" and [] as missing for required fields.
  if (field.required && out.type === 'string' && out.minLength === undefined) out.minLength = 1
  if (field.required && out.type === 'array' && out.minItems === undefined) out.minItems = 1
  if (isJsonValue(field.defaultValue)) out.default = field.defaultValue
  return out
}

function isJsonValue(value: unknown): boolean {
  if (value === undefined || typeof value === 'function') return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}
