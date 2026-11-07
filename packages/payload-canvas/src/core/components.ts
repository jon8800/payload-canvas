// Components: saved sections with properties. A property is a binding inside the saved section
// that reads `$component.<name>`, e.g. `{ text: '$component.title' }` on a heading. The bindings
// are the only record of the properties: their type comes from the bound field, their default is
// the bound prop's own value (the literal value every binding keeps as its fallback). A live copy
// (`sectionRef`) stores its own values in `props.values`; `applyComponentValues` puts them into
// the section's blocks before the rest of the data loading. Pure: no React, no Payload.

import { isLinkField } from '../blocks/link'
import { bindingPaths, bindProps, getByPath, isMissing, isRichText, plainToRichText, propField, toPlainText } from './bindings'
import type { DataField } from './fields'
import { isPlainObject } from './tree'
import type { Block, BlockDefinition, BlockProps } from './types'

/** Binding root of a component's properties: `$component.title`. */
export const COMPONENT_PATH = '$component'

/** Binding key for a "visible" property: `bindings: { $visible: '$component.showButton' }` shows or hides the block. */
export const VISIBLE_BINDING = '$visible'

export type ComponentPropertyType = 'text' | 'richText' | 'image' | 'link' | 'visible' | 'other'

export type ComponentProperty = {
  /** Key in a copy's values and in the binding (`$component.<name>`). */
  name: string
  label: string
  type: ComponentPropertyType
  /** The first block that uses the property, and its prop path (`$visible` for a visible property). */
  blockId: string
  propPath: string
  /** The master's value: what a copy shows until it sets its own. */
  default: unknown
  /** The bound prop's field config (not for visible properties). */
  field?: DataField
}

/** Values of a copy, by property name. */
export type ComponentValues = Record<string, unknown>

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/
const PREFIX = `${COMPONENT_PATH}.`

/** A property name from the label someone typed: "Button text" -> "buttonText". Empty when nothing is left. */
export function propertyName(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const name = words.map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1))).join('')
  return name.replace(/^[0-9_]+/, '')
}

/** The label of a property name: "buttonText" -> "Button text". */
export function propertyLabel(name: string): string {
  const words = name.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The binding of a property: "$component.title". */
export function propertyBinding(name: string): string {
  return `${PREFIX}${name}`
}

/** The property a binding is, when it is exactly `$component.<name>`. Else null. */
export function propertyOf(binding: string): string | null {
  if (!binding.startsWith(PREFIX)) return null
  const name = binding.slice(PREFIX.length)
  return NAME.test(name) ? name : null
}

/** True when a binding reads at least one property. */
export function readsComponent(binding: string): boolean {
  return binding.includes(PREFIX)
}

/** The property type of a prop's field, or null when such a prop cannot be a property. */
export function propertyType(field: DataField | undefined): Exclude<ComponentPropertyType, 'visible' | 'other'> | null {
  if (!field) return null
  if (isLinkField(field)) return 'link'
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
      return field.hasMany ? null : 'text'
    case 'richText':
      return 'richText'
    case 'upload':
      return field.hasMany || typeof field.relationTo !== 'string' ? null : 'image'
    default:
      return null
  }
}

type Definitions = ReadonlyMap<string, BlockDefinition>
const definitionMap = (blocks: readonly BlockDefinition[] | Definitions): Definitions =>
  blocks instanceof Map ? blocks : new Map((blocks as readonly BlockDefinition[]).map((d) => [d.type, d]))

function eachBlock(blocks: readonly Block[], fn: (block: Block) => void): void {
  for (const block of blocks) {
    fn(block)
    for (const list of Object.values(block.slots ?? {})) eachBlock(list, fn)
  }
}

/**
 * The properties of a saved section's blocks, in layout order. A name used by several blocks is
 * one property: the first block gives its type and default.
 */
export function componentProperties(blocks: readonly Block[], definitions: readonly BlockDefinition[] | Definitions): ComponentProperty[] {
  const defs = definitionMap(definitions)
  const found = new Map<string, ComponentProperty>()
  eachBlock(blocks, (block) => {
    for (const [propPath, binding] of Object.entries(block.bindings ?? {})) {
      const name = propertyOf(binding)
      if (!name || found.has(name)) continue
      if (propPath === VISIBLE_BINDING) {
        found.set(name, { name, label: propertyLabel(name), type: 'visible', blockId: block.id, propPath, default: !block.hidden })
        continue
      }
      const definition = defs.get(block.type)
      const field = definition ? propField(definition.fields as unknown[], propPath) : undefined
      found.set(name, {
        name,
        label: propertyLabel(name),
        type: propertyType(field) ?? 'other',
        blockId: block.id,
        propPath,
        default: getByPath(block.props, propPath),
        ...(field ? { field } : {}),
      })
    }
  })
  return [...found.values()]
}

/** True when the blocks have at least one property: the saved section is a component. */
export function isComponent(blocks: readonly Block[]): boolean {
  let found = false
  eachBlock(blocks, (block) => {
    if (!found) found = Object.values(block.bindings ?? {}).some((binding) => propertyOf(binding) !== null)
  })
  return found
}

/** The names a block's bindings use as properties, by prop path. */
export function blockProperties(block: Block): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [propPath, binding] of Object.entries(block.bindings ?? {})) {
    const name = propertyOf(binding)
    if (name) out[propPath] = name
  }
  return out
}

/** A copy's stored values: `props.values` when it is an object. */
export function componentValuesOf(props: BlockProps | undefined): ComponentValues {
  const values = props?.values
  return isPlainObject(values) ? values : {}
}

/**
 * Puts the `{{$component.x}}` parts of a template string in as text. Other parts stay for the
 * page's own binding step. `found`: at least one part had a value.
 */
function fillTemplate(binding: string, values: ComponentValues): { text: string; found: boolean } {
  let found = false
  const text = binding.replace(/\{\{([^{}]+)\}\}/g, (whole, expression: string) => {
    const paths = bindingPaths(expression)
    if (paths.length === 0 || !paths.every((p) => p.startsWith(PREFIX))) return whole
    const name = propertyOf(paths[0]!)
    const part = name ? toPlainText(values[name]) : undefined
    if (part === undefined) return ''
    found = true
    return part.replace(/[{}]/g, '')
  })
  return { text, found }
}

function applyToBlock(block: Block, values: ComponentValues, defs: Definitions): Block {
  let next = block
  if (block.bindings && Object.values(block.bindings).some(readsComponent)) {
    const own: Record<string, string> = {}
    const rest: Record<string, string> = {}
    const texts: Record<string, string> = {}
    let visible: boolean | undefined
    for (const [propPath, binding] of Object.entries(block.bindings)) {
      if (!readsComponent(binding)) {
        rest[propPath] = binding
      } else if (propPath === VISIBLE_BINDING) {
        const name = propertyOf(binding)
        const value = name ? values[name] : undefined
        if (typeof value === 'boolean') visible = value
      } else if (binding.includes('{{')) {
        const { text, found } = fillTemplate(binding, values)
        // Parts that read the page's data stay a binding; else the text replaces the prop.
        if (text.includes('{{')) rest[propPath] = text
        else if (found) texts[propPath] = text
      } else if (bindingPaths(binding).every((p) => p.startsWith(PREFIX))) {
        own[propPath] = binding.split(PREFIX).join('')
      } else {
        // A fallback chain that also reads the page's data stays for the page's own binding step.
        rest[propPath] = binding
      }
    }
    const definition = defs.get(block.type)
    const bound = bindProps(block.props ?? {}, own, { collection: '', doc: values }, definition)
    // Filled template strings go in through the same coercion (a rich text prop gets rich text).
    const entries = Object.entries(texts)
    const filled = bindProps(
      bound.props,
      Object.fromEntries(entries.map(([propPath], i) => [propPath, `t${i}`])),
      { collection: '', doc: Object.fromEntries(entries.map(([, text], i) => [`t${i}`, text])) },
      definition,
    )
    next = { ...block, props: filled.props }
    if (Object.keys(next.props ?? {}).length === 0) delete next.props
    if (Object.keys(rest).length > 0) next.bindings = rest
    else delete next.bindings
    if (visible === false) next.hidden = true
    else if (visible === true) delete next.hidden
  }
  if (!next.slots) return next
  return {
    ...next,
    slots: Object.fromEntries(Object.entries(next.slots).map(([name, list]) => [name, list.map((child) => applyToBlock(child, values, defs))])),
  }
}

/**
 * The section's blocks with a copy's values put in: each `$component.<name>` binding takes the
 * copy's value, or keeps the master's value when the copy has none (empty counts as none). The
 * property bindings are removed; other bindings stay. A visible property set to false hides the
 * block. `{}` gives the master's own content without the property bindings (a plain copy).
 * Never mutates.
 */
export function applyComponentValues(blocks: readonly Block[], values: ComponentValues, definitions: readonly BlockDefinition[] | Definitions): Block[] {
  const defs = definitionMap(definitions)
  return blocks.map((block) => applyToBlock(block, values, defs))
}

/** A relationship value as an ID: a `{ relationTo, value }` pair or a loaded document give theirs. */
function idOf(value: unknown): unknown {
  if (isPlainObject(value) && 'relationTo' in value) return idOf(value.value)
  if (isPlainObject(value) && 'id' in value) return value.id
  return value
}

/**
 * One value as a copy stores it. Images are stored as `{ relationTo, value }`, so the references
 * of a page find them without loading the component. Undefined: no value (the default shows).
 */
export function storedValue(property: ComponentProperty, value: unknown): unknown {
  if (isMissing(value)) return undefined
  switch (property.type) {
    case 'image': {
      const id = idOf(value)
      const relationTo = property.field?.relationTo
      if ((typeof id !== 'string' && typeof id !== 'number') || id === '' || typeof relationTo !== 'string') return undefined
      return { relationTo, value: id }
    }
    case 'visible':
      return typeof value === 'boolean' ? value : undefined
    case 'text':
      return toPlainText(value)
    case 'richText':
      if (isRichText(value)) return value
      return typeof value === 'string' ? plainToRichText(value) : undefined
    case 'link':
      if (typeof value === 'string') return { type: 'url', url: value }
      return isPlainObject(value) ? value : undefined
    default:
      return value
  }
}

/** A stored value as the property's field input takes it: an image's ID. */
export function fieldValue(property: ComponentProperty, value: unknown): unknown {
  return property.type === 'image' ? idOf(value) : value
}

/**
 * Checks values for a copy (MCP, the assistant): unknown names and values of the wrong kind are
 * problems. Returns the values as a copy stores them (`storedValue`), without empty ones.
 */
export function checkComponentValues(
  properties: readonly ComponentProperty[],
  values: unknown,
): { values: ComponentValues; problems: string[] } {
  const problems: string[] = []
  const out: ComponentValues = {}
  if (values === undefined || values === null) return { values: out, problems }
  if (!isPlainObject(values)) return { values: out, problems: ['values must be an object of property name -> value.'] }
  const byName = new Map(properties.map((p) => [p.name, p]))
  for (const [name, value] of Object.entries(values)) {
    const property = byName.get(name)
    if (!property) {
      const known = properties.map((p) => p.name).join(', ') || 'none'
      problems.push(`Unknown property "${name}". Properties: ${known}.`)
      continue
    }
    if (isMissing(value)) continue
    const stored = storedValue(property, value)
    if (stored === undefined) {
      problems.push(`Property "${name}" (${property.type}) cannot take ${JSON.stringify(value).slice(0, 60)}.`)
      continue
    }
    out[name] = stored
  }
  return { values: out, problems }
}

/** The values without names the component no longer has. Same object when nothing is dropped. */
export function knownValues(properties: readonly ComponentProperty[], values: ComponentValues): ComponentValues {
  const names = new Set(properties.map((p) => p.name))
  const keys = Object.keys(values)
  return keys.every((key) => names.has(key)) ? values : Object.fromEntries(keys.filter((key) => names.has(key)).map((key) => [key, values[key]]))
}
