// Templates and binding (docs/architecture.md section 11). Pure TypeScript: no React, no Payload
// runtime. The site renderer, the canvas iframe, the save hook and the MCP tools all use it.
//
// A block binds props to document fields with `bindings: { propPath: fieldPath }`. At render time
// the bound props take the document's value. Missing values (undefined, null, "", []) keep the
// literal prop.

import { isLinkField } from '../blocks/link'
import { dataFields, type DataField } from './fields'
import { isPlainObject, walkBlocks } from './tree'
import type { Block, BindingField, BlockDefinition, BlockProps, Layout, TemplateContext } from './types'
import type { LayoutError } from './validate'

// ---------------------------------------------------------------------------
// Names shared by the plugin, the renderer and the editor
// ---------------------------------------------------------------------------

/** Default slug of the templates collection. */
export const DEFAULT_TEMPLATES_SLUG = 'builder-templates'
/** Templates collection: the field that holds the target collection slug. */
export const TEMPLATE_TARGET_FIELD = 'targetCollection'
/** Templates collection: the checkbox that marks a collection's default template. */
export const TEMPLATE_DEFAULT_FIELD = 'isDefault'
/** Templates collection: the optional sample document for the editor preview. */
export const TEMPLATE_PREVIEW_FIELD = 'previewDocument'
/** Templates collection: the layout field. */
export const TEMPLATE_LAYOUT_FIELD = 'layout'
/** Template-enabled collections: the relationship to the document's own template. */
export const DOCUMENT_TEMPLATE_FIELD = 'template'

/** Virtual binding path: the frontend URL of the context document (from the link resolver). */
export const URL_PATH = '$url'

/** The Field block: shows the context document's value at `props.path`. */
export const FIELD_BLOCK = 'field'
/** The collection list block: renders its `item` slot once per loaded document. */
export const COLLECTION_LIST_BLOCK = 'collectionList'
/** Slot of the collection list block that holds the template for one item. */
export const LIST_ITEM_SLOT = 'item'
/**
 * Runtime-only prop: the documents a collection list renders. `loadLayoutData` and the canvas set
 * it. It is never stored.
 */
export const LIST_ITEMS_PROP = '$items'
/** Runtime-only prop of the Field block: the resolved value. It is never stored. */
export const FIELD_VALUE_PROP = 'value'

// ---------------------------------------------------------------------------
// Reading values
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>

/** A `{ relationTo, value }` pair (polymorphic relationships). */
function isRelationPair(value: unknown): value is { relationTo: string; value: unknown } {
  return isPlainObject(value) && typeof value.relationTo === 'string' && 'value' in value
}

function step(current: unknown, key: string): unknown {
  if (current === undefined || current === null) return undefined
  if (Array.isArray(current)) {
    if (/^\d+$/.test(key)) return current[Number(key)]
    // A path through an array (hasMany relationship, array field) collects every item's value.
    const values = current.map((item) => step(item, key)).flat().filter((v) => v !== undefined && v !== null)
    return values.length > 0 ? values : undefined
  }
  if (isRelationPair(current) && !(key in current)) return step(current.value, key)
  if (!isPlainObject(current)) return undefined
  return current[key]
}

/**
 * The value at a dot path. Goes through objects, arrays (a non-numeric key collects the value of
 * every item) and populated relationships (`{ relationTo, value }` pairs too). An unpopulated
 * relationship (an ID) ends the path with `undefined`.
 */
export function getByPath(doc: unknown, path: string): unknown {
  if (!path) return undefined
  let current: unknown = doc
  for (const key of path.split('.')) {
    current = step(current, key)
    if (current === undefined) return undefined
  }
  return current
}

/** True for values that count as "no value": the literal prop stays. */
export function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

/** Lexical editor state (rich text JSON). */
export function isRichText(value: unknown): value is { root: Record<string, unknown> } {
  return isPlainObject(value) && isPlainObject(value.root)
}

/** A loaded upload document (has a `url`). */
export function isUploadDoc(value: unknown): value is Doc & { url: string } {
  return isPlainObject(value) && typeof value.url === 'string' && ('filename' in value || 'mimeType' in value)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/

/** An ISO date-time string, as Payload stores date fields and timestamps. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

// One formatter: the same output on the server and in the browser (UTC, English).
let dateFormat: Intl.DateTimeFormat | undefined

/** "Sep 10, 2026". Locale-neutral on purpose, so server and canvas render the same text. */
export function formatDate(value: string | Date): string {
  dateFormat ??= new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? String(value) : dateFormat.format(date)
}

/**
 * A readable name for a document: title, name, label, slug, filename, then id. Never the email:
 * a user's email is private, also when the user is the document's author.
 */
export function titleOf(doc: unknown): string | undefined {
  if (isRelationPair(doc)) return titleOf(doc.value)
  if (!isPlainObject(doc)) return typeof doc === 'string' || typeof doc === 'number' ? String(doc) : undefined
  for (const key of ['title', 'name', 'label', 'slug', 'filename']) {
    const value = doc[key]
    if (typeof value === 'string' && value) return value
  }
  return doc.id === undefined || doc.id === null ? undefined : String(doc.id)
}

const BLOCK_NODES = new Set(['paragraph', 'heading', 'listitem', 'quote', 'list'])

/** The text of Lexical rich text. Paragraphs, headings and list items become lines. */
export function richTextToPlain(value: unknown): string {
  if (!isRichText(value)) return ''
  const lines: string[] = []
  let line = ''
  const flush = () => {
    if (line.trim()) lines.push(line.trim())
    line = ''
  }
  const visit = (node: unknown) => {
    if (!isPlainObject(node)) return
    if (node.type === 'text' && typeof node.text === 'string') line += node.text
    else if (node.type === 'linebreak') line += '\n'
    else if (node.type === 'tab') line += '\t'
    const children = Array.isArray(node.children) ? node.children : []
    const block = typeof node.type === 'string' && BLOCK_NODES.has(node.type) && node.type !== 'list'
    if (block) flush()
    children.forEach(visit)
    if (block) flush()
  }
  visit(value.root)
  flush()
  return lines.join('\n')
}

/** Minimal Lexical rich text: one paragraph per line. */
export function plainToRichText(text: string): { root: Record<string, unknown> } {
  const element = { direction: 'ltr', format: '', indent: 0, version: 1 }
  const paragraphs = text.split(/\r?\n/).map((line) => ({
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: line ? [{ type: 'text', text: line, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] : [],
  }))
  return { root: { ...element, type: 'root', children: paragraphs } }
}

/**
 * Any field value as plain text: rich text loses its formatting, dates are formatted, documents
 * show their title, lists are joined with ", ". `undefined` when nothing readable is left.
 */
export function toPlainText(value: unknown): string | undefined {
  if (isMissing(value)) return undefined
  if (typeof value === 'string') return isIsoDate(value) ? formatDate(value) : value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value instanceof Date) return formatDate(value)
  if (isRichText(value)) return richTextToPlain(value) || undefined
  if (Array.isArray(value)) {
    const parts = value.map(toPlainText).filter((part): part is string => Boolean(part))
    return parts.length > 0 ? parts.join(', ') : undefined
  }
  return titleOf(value)
}

// ---------------------------------------------------------------------------
// Prop fields and coercion
// ---------------------------------------------------------------------------

/** The block field a prop path points to, through groups (e.g. "link.url"). */
export function propField(fields: readonly unknown[], propPath: string): DataField | undefined {
  let list: readonly unknown[] = fields
  let found: DataField | undefined
  for (const key of propPath.split('.')) {
    found = dataFields(list).find((f) => f.name === key)
    if (!found) return undefined
    list = found.fields ?? []
  }
  return found
}

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'code'])

/**
 * Turns a document value into a value the prop's field accepts. `undefined` means "no usable
 * value": the literal prop stays.
 */
export function coerceValue(value: unknown, field: DataField | undefined): unknown {
  if (isMissing(value)) return undefined
  if (!field) return value
  if (TEXT_TYPES.has(field.type)) {
    if (field.hasMany && Array.isArray(value)) return value.map(toPlainText).filter(Boolean)
    return toPlainText(value)
  }
  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
      return Number.isFinite(n) ? n : undefined
    }
    case 'checkbox':
      return Boolean(value)
    case 'richText':
      if (isRichText(value)) return value
      return typeof value === 'string' || typeof value === 'number' ? plainToRichText(String(value)) : undefined
    case 'date':
      if (value instanceof Date) return value.toISOString()
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
    case 'select':
    case 'radio':
      return typeof value === 'string' ? value : undefined
    case 'upload':
    case 'relationship': {
      if (Array.isArray(field.relationTo)) return isRelationPair(value) ? value : undefined
      if (field.hasMany) return Array.isArray(value) ? value : [value]
      const one = Array.isArray(value) ? value[0] : value
      return isRelationPair(one) ? one.value : one
    }
    case 'group':
      // A link group takes a URL string (for example the `$url` path).
      if (isLinkField(field) && typeof value === 'string') return { type: 'url', url: value }
      return isPlainObject(value) ? value : undefined
    case 'array':
      return Array.isArray(value) ? value : undefined
    case 'json':
      return value
    default:
      return value
  }
}

/** Sets a dot path in a props object without mutating it. */
function setByPath(props: BlockProps, path: string[], value: unknown): BlockProps {
  const [key, ...rest] = path
  if (rest.length === 0) return { ...props, [key]: value }
  const current = props[key]
  const nested = isPlainObject(current) ? current : {}
  return { ...props, [key]: setByPath(nested, rest, value) }
}

// ---------------------------------------------------------------------------
// Resolving bindings
// ---------------------------------------------------------------------------

export type BindingOptions = {
  /**
   * The frontend URL of a context document, for the `$url` path. The renderer passes its link
   * resolver here. Without it, `$url` bindings stay unresolved.
   */
  url?: (context: TemplateContext) => string | null | undefined
}

/** The context document's value at a binding path (`$url` included). */
export function bindingValue(context: TemplateContext, path: string, options?: BindingOptions): unknown {
  if (path === URL_PATH) return options?.url?.(context) ?? undefined
  return getByPath(context.doc, path)
}

/**
 * Resolves one block's bindings (not its children). Bound props with a value take it; applied
 * bindings are removed from the result, unresolved ones stay. A Field block gets
 * `props.value`. Returns the same block when nothing changes.
 */
export function resolveBlockBindings(
  block: Block,
  context: TemplateContext,
  definition: BlockDefinition | undefined,
  options?: BindingOptions,
): Block {
  let props = block.props ?? {}
  let changed = false
  const left: Record<string, string> = {}

  for (const [propPath, fieldPath] of Object.entries(block.bindings ?? {})) {
    const field = definition ? propField(definition.fields as unknown[], propPath) : undefined
    const value = coerceValue(bindingValue(context, fieldPath, options), field)
    if (value === undefined) {
      left[propPath] = fieldPath
      continue
    }
    const path = propPath.split('.')
    props = setByPath(props, path, value)
    // Binding a link group's URL makes it a URL link.
    if (path.length > 1 && path.at(-1) === 'url' && definition) {
      const parent = propField(definition.fields as unknown[], path.slice(0, -1).join('.'))
      if (parent && isLinkField(parent)) props = setByPath(props, [...path.slice(0, -1), 'type'], 'url')
    }
    changed = true
  }

  if (block.type === FIELD_BLOCK && typeof props.path === 'string' && props.path) {
    const value = bindingValue(context, props.path, options)
    if (!isMissing(value)) {
      props = { ...props, [FIELD_VALUE_PROP]: value }
      changed = true
    }
  }

  if (!changed) return block
  const next: Block = { ...block, props }
  if (Object.keys(left).length > 0) next.bindings = left
  else delete next.bindings
  return next
}

/**
 * Resolves every block's bindings against the context document. The `item` slot of a collection
 * list is left alone: its blocks bind to each listed document at render time. Applied bindings are
 * removed, so resolving twice is safe. Never mutates.
 */
export function resolveBindings(
  layout: Layout,
  context: TemplateContext,
  blocks: readonly BlockDefinition[],
  options?: BindingOptions,
): Layout {
  const definitions = new Map(blocks.map((d) => [d.type, d]))
  const visit = (list: Block[]): Block[] =>
    list.map((block) => {
      const next = resolveBlockBindings(block, context, definitions.get(block.type), options)
      if (!next.slots) return next
      const slots = Object.fromEntries(
        Object.entries(next.slots).map(([name, children]) => [
          name,
          next.type === COLLECTION_LIST_BLOCK && name === LIST_ITEM_SLOT ? children : visit(children),
        ]),
      )
      return { ...next, slots }
    })
  return { ...layout, blocks: visit(layout.blocks) }
}

/**
 * Drops `required` errors on bound props: the document fills them at render time, so a template
 * may leave the literal value empty.
 */
export function withoutBoundRequired(errors: LayoutError[], layout: unknown): LayoutError[] {
  if (!isPlainObject(layout) || !Array.isArray(layout.blocks)) return errors
  const bound = new Map<string, string[]>()
  walkBlocks(layout as Layout, (block) => {
    if (isPlainObject(block) && isPlainObject(block.bindings) && typeof block.id === 'string') {
      bound.set(block.id, Object.keys(block.bindings))
    }
  })
  if (bound.size === 0) return errors
  return errors.filter((error) => {
    if (error.code !== 'required' || !error.blockId) return true
    const keys = bound.get(error.blockId)
    return !keys?.some((key) => error.path.endsWith(`.props.${key}`))
  })
}

// ---------------------------------------------------------------------------
// Checking bindings against the data model
// ---------------------------------------------------------------------------

/** Text-like field types that can hold a URL. They count only when the field name says so. */
const URL_TEXT_TYPES = new Set(['text', 'code'])
/** Field names that hold a URL, e.g. `url`, `externalLink`, `website`, `link.href`. */
const URL_NAME = /url|href|link|website/i

/** The binding source at `path` in a collection's bindable fields (children included). */
export function findBindingField(fields: readonly BindingField[], path: string): BindingField | undefined {
  for (const field of fields) {
    if (field.path === path) return field
    if (field.children && path.startsWith(`${field.path}.`)) {
      const found = findBindingField(field.children, path)
      if (found) return found
    }
  }
  return undefined
}

/** True when a source can give a link its URL: `$url`, or a text field named like a URL. */
export function isUrlSource(source: Pick<BindingField, 'path' | 'type' | 'hasMany'>): boolean {
  if (source.hasMany) return false
  if (source.path === URL_PATH || source.type === URL_PATH) return true
  if (!URL_TEXT_TYPES.has(source.type)) return false
  return URL_NAME.test(source.path.slice(source.path.lastIndexOf('.') + 1))
}

/** True when the prop at `propPath` is a link: a link group, or the `url` inside one. */
function isLinkProp(fields: readonly unknown[], propPath: string): boolean {
  if (isLinkField(propField(fields, propPath))) return true
  const parts = propPath.split('.')
  return parts.length > 1 && parts.at(-1) === 'url' && isLinkField(propField(fields, parts.slice(0, -1).join('.')))
}

/**
 * Why a prop cannot take its value from `source`, or `null` when it can. Rules the save hook
 * enforces on publish (the binding picker offers fewer):
 * - a link (group or its `url`) takes only a URL: `$url` or a text field named like a URL;
 * - a one-line text prop (`text`) cannot show rich text.
 */
export function bindingProblem(fields: readonly unknown[], propPath: string, source: BindingField): string | null {
  if (isLinkProp(fields, propPath)) {
    return isUrlSource(source) ? null : 'a link can use only the page URL or a URL field'
  }
  const field = propField(fields, propPath)
  if (field?.type === 'text' && source.type === 'richText') return 'one-line text cannot show rich text'
  return null
}

/**
 * Checks every binding against the bindable fields of the document it reads: the template's
 * target collection, or inside a collection list's `item` slot, the listed collection. Problems
 * have the code `binding` (they block publishing only). Paths missing from `sources` are left
 * alone: the renderer keeps the literal value.
 */
export function validateBindings(
  layout: Layout,
  blocks: readonly BlockDefinition[],
  sources: Record<string, readonly BindingField[]>,
  collection: string | null,
): LayoutError[] {
  const definitions = new Map(blocks.map((d) => [d.type, d]))
  const errors: LayoutError[] = []
  const visit = (list: Block[], path: string, scope: string | null) => {
    list.forEach((block, i) => {
      const at = `${path}[${i}]`
      const definition = definitions.get(block.type)
      const fields = scope ? sources[scope] : undefined
      if (definition && fields) {
        for (const [propPath, fieldPath] of Object.entries(block.bindings ?? {})) {
          const source = fieldPath === URL_PATH ? { path: URL_PATH, label: 'Page URL', type: 'text' } : findBindingField(fields, fieldPath)
          if (!source) continue
          const problem = bindingProblem(definition.fields as unknown[], propPath, source)
          if (problem) {
            errors.push({ blockId: block.id, path: `${at}.bindings.${propPath}`, message: `Cannot bind "${propPath}" to "${fieldPath}": ${problem}`, code: 'binding' })
          }
        }
      }
      for (const [name, children] of Object.entries(block.slots ?? {})) {
        const listed = block.type === COLLECTION_LIST_BLOCK && name === LIST_ITEM_SLOT
        const next = listed ? (typeof block.props?.collection === 'string' ? block.props.collection : null) : scope
        visit(children, `${at}.slots.${name}`, next)
      }
    })
  }
  visit(layout.blocks, 'blocks', collection)
  return errors
}
