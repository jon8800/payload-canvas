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
/**
 * The repeat block: renders its `item` slot once per row of an array or hasMany field of the
 * current document (`props.path`). The rows are its runtime-only `$items` prop.
 */
export const REPEAT_BLOCK = 'repeat'
/** Collection list slot shown when the list has no documents. */
export const LIST_EMPTY_SLOT = 'empty'
/** Virtual binding path inside a repeat item: the row value itself (a document, an upload, a text). */
export const ITEM_PATH = '$item'
/** Virtual binding path inside a collection list or repeat item: the item number, from 1. */
export const INDEX_PATH = '$index'
/** Virtual path prefix inside a collection list or repeat item: the enclosing document (`$parent.name`). */
export const PARENT_PATH = '$parent'
/** Virtual path prefix: the page's own document (`$page.title`), also inside list and repeat items. */
export const PAGE_PATH = '$page'
/**
 * Binding key that shows or hides the block: `"field"` shows it when the field is filled,
 * `"!field"` when it is empty, `"field=value"` when it equals the value, `"field!=value"` when not.
 */
export const VISIBLE_BINDING = '$visible'

/** True for the slot that repeats per item: the `item` slot of a collection list or a repeat. */
export function isRepeatSlot(type: string, slot: string): boolean {
  return slot === LIST_ITEM_SLOT && (type === COLLECTION_LIST_BLOCK || type === REPEAT_BLOCK)
}

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

const wholeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined

/**
 * The rows of a repeat: the value at `props.path` in the context (an array field's rows, a hasMany
 * field's documents, IDs or values; one value counts as one row), after `offset` and `limit`.
 * The path may start with `$parent.` or `$page.`.
 */
export function repeatRows(context: TemplateContext, props: BlockProps | undefined): unknown[] {
  const path = typeof props?.path === 'string' ? props.path.trim() : ''
  if (!path) return []
  const value = pathValue(context, path)
  const rows = (Array.isArray(value) ? value : [value]).filter((row) => row !== undefined && row !== null)
  const offset = wholeNumber(props?.offset) ?? 0
  const limit = wholeNumber(props?.limit)
  return rows.slice(offset, limit === undefined ? undefined : offset + limit)
}

/**
 * The context one repeat row binds to: the row's own fields (an array row, or the related document
 * of a relationship or upload), `$item` (the row value), `$index` (from 1), `$parent` (the
 * enclosing document) and `$page`. `collection` is the related collection for `$url`; a
 * `{ relationTo, value }` row names its own.
 */
export function repeatRowContext(row: unknown, index: number, around: TemplateContext | null, collection = ''): TemplateContext {
  const pair = isRelationPair(row)
  const value = pair ? row.value : row
  return {
    ...itemContext(around, index),
    collection: pair ? row.relationTo : collection,
    doc: isPlainObject(value) ? value : {},
    item: value,
  }
}

/** The context of one collection list item (a listed document). */
export function listItemContext(doc: Doc, index: number, around: TemplateContext | null, collection: string): TemplateContext {
  return { ...itemContext(around, index), collection, doc }
}

/** `$index`, `$parent` and `$page` of an item inside `around`. */
function itemContext(around: TemplateContext | null, index: number): Omit<TemplateContext, 'collection' | 'doc'> {
  const out: Omit<TemplateContext, 'collection' | 'doc'> = { index: index + 1 }
  if (around) {
    out.parent = around.doc
    out.page = around.page ?? around.doc
  }
  return out
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

/** The fields `titleOf` reads, in order. */
export const TITLE_KEYS = ['title', 'name', 'label', 'slug', 'filename'] as const

/**
 * A readable name for a document: title, name, label, slug, filename, then id. Never the email:
 * a user's email is private, also when the user is the document's author.
 */
export function titleOf(doc: unknown): string | undefined {
  if (isRelationPair(doc)) return titleOf(doc.value)
  if (!isPlainObject(doc)) return typeof doc === 'string' || typeof doc === 'number' ? String(doc) : undefined
  for (const key of TITLE_KEYS) {
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

/**
 * The value at one plain path: a field of the context document, or a virtual path: `$url`,
 * `$item` (and `$item.url`), `$index`, `$parent.<path>`, `$page.<path>`.
 */
function pathValue(context: TemplateContext, path: string, options?: BindingOptions): unknown {
  if (path === URL_PATH) return options?.url?.(context) ?? undefined
  const dot = path.indexOf('.')
  const head = dot < 0 ? path : path.slice(0, dot)
  const rest = dot < 0 ? '' : path.slice(dot + 1)
  let root: unknown
  switch (head) {
    case ITEM_PATH:
      root = context.item
      break
    case INDEX_PATH:
      return rest ? undefined : context.index
    case PARENT_PATH:
      root = context.parent
      break
    case PAGE_PATH:
      root = context.page ?? context.doc
      break
    default:
      return getByPath(context.doc, path)
  }
  return rest ? getByPath(root, rest) : root
}

const currencyFormats = new Map<string, Intl.NumberFormat>()

/** First sentence of plain text: up to the first ".", "!" or "?" followed by a space or the end. */
function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/s.exec(text.trim())
  return (match ? match[0] : text).trim()
}

/**
 * Formatters for binding expressions (`price|currency:AUD`). Each takes a value that is not
 * missing and returns text, or undefined when it cannot format the value.
 */
export const BINDING_FORMATTERS: Record<string, (value: unknown, args: string[]) => string | undefined> = {
  /** `date[:locale[:timeZone]]`, e.g. `date:en-AU:Australia/Brisbane`. Default `en`, UTC. */
  date(value, [locale, timeZone]) {
    const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return undefined
    try {
      return new Intl.DateTimeFormat(locale || 'en', { dateStyle: 'medium', timeZone: timeZone || 'UTC' }).format(date)
    } catch {
      return formatDate(date)
    }
  },
  /** `currency[:code[:locale]]`, e.g. `currency:AUD` gives "$1,200". Whole amounts have no cents. */
  currency(value, [code = 'USD', locale = 'en']) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    if (!Number.isFinite(n)) return undefined
    const whole = Number.isInteger(n)
    const key = `${code}\u0000${locale}\u0000${whole}`
    try {
      let format = currencyFormats.get(key)
      if (!format) {
        format = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: code.toUpperCase(),
          currencyDisplay: 'narrowSymbol',
          ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
        })
        currencyFormats.set(key, format)
      }
      return format.format(n)
    } catch {
      return undefined
    }
  },
  /** `number[:locale]`: digit grouping, e.g. "1,200". */
  number(value, [locale = 'en']) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    if (!Number.isFinite(n)) return undefined
    try {
      return new Intl.NumberFormat(locale).format(n)
    } catch {
      return String(n)
    }
  },
  /** `firstSentence`: the first sentence of the plain text (rich text too). */
  firstSentence(value) {
    const text = toPlainText(value)
    return text ? firstSentence(text) : undefined
  },
}

/** One `|` part of an expression: a formatter (by name, after the first part) or a path. */
function formatterOf(part: string): { name: string; args: string[] } | null {
  const [name = '', ...args] = part.split(':')
  return Object.hasOwn(BINDING_FORMATTERS, name) ? { name, args } : null
}

/**
 * One expression: paths separated by `|` (the first that is not missing wins), then formatters
 * (`a|b|date:en-AU`). The first part is always a path.
 */
function expressionValue(context: TemplateContext, expression: string, options?: BindingOptions): unknown {
  const parts = expression.split('|').map((part) => part.trim())
  let value: unknown
  let i = 0
  for (; i < parts.length; i++) {
    if (i > 0 && formatterOf(parts[i]!)) break
    if (isMissing(value)) value = pathValue(context, parts[i]!, options)
  }
  for (; i < parts.length; i++) {
    const formatter = formatterOf(parts[i]!)
    if (!formatter) continue
    if (isMissing(value)) return undefined
    value = BINDING_FORMATTERS[formatter.name]!(value, formatter.args)
  }
  return value
}

const TEMPLATE = /\{\{([^{}]+)\}\}/g

/** True when a binding is more than one plain path: a template string, a fallback chain or a formatter. */
export function isBindingExpression(binding: string): boolean {
  return binding.includes('{{') || binding.includes('|')
}

/**
 * The value of a binding:
 * - a path: `title`, `author.name`, or a virtual path (`$url`, `$item`, `$index`, `$parent.name`, `$page.title`);
 * - a fallback chain: `heading|name` (the first value that is not missing);
 * - formatters after the paths: `publishedAt|date:en-AU:Australia/Brisbane`, `price|currency:AUD`, `bio|firstSentence`;
 * - a template string: `Enquire about {{name}}`. Each `{{expression}}` becomes text; a missing one
 *   becomes empty. When every one is missing, the value is missing (the literal prop stays).
 */
export function bindingValue(context: TemplateContext, binding: string, options?: BindingOptions): unknown {
  if (!binding.includes('{{')) return expressionValue(context, binding, options)
  let found = false
  const text = binding.replace(TEMPLATE, (_, expression: string) => {
    const part = toPlainText(expressionValue(context, expression, options))
    if (part === undefined) return ''
    found = true
    return part
  })
  return found ? text : undefined
}

/** The plain field paths a binding reads (no formatters, no virtual `$url`, `$item`, `$index`). */
export function bindingPaths(key: string, binding: string): string[] {
  const expressions = binding.includes('{{')
    ? [...binding.matchAll(TEMPLATE)].map((m) => m[1]!)
    : [key === VISIBLE_BINDING ? conditionOf(binding).path : binding]
  return expressions.flatMap((expression) =>
    expression
      .split('|')
      .map((part) => part.trim())
      .filter((part, i) => part && (i === 0 || !formatterOf(part)))
      .filter((path) => path !== URL_PATH && path.split('.')[0] !== ITEM_PATH && path !== INDEX_PATH),
  )
}

type Condition = { path: string; test: 'filled' | 'empty' | 'equals' | 'differs'; value: string }

/** `field`, `!field`, `field=value`, `field!=value`. */
function conditionOf(condition: string): Condition {
  const text = condition.trim()
  const differs = text.indexOf('!=')
  if (differs > 0) return { path: text.slice(0, differs).trim(), test: 'differs', value: text.slice(differs + 2).trim() }
  const equals = text.indexOf('=')
  if (equals > 0) return { path: text.slice(0, equals).trim(), test: 'equals', value: text.slice(equals + 1).trim() }
  if (text.startsWith('!')) return { path: text.slice(1).trim(), test: 'empty', value: '' }
  return { path: text, test: 'filled', value: '' }
}

/** True when a value matches `expected`: itself, a document's id, or any item of a list. */
function matches(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => matches(item, expected))
  if (isRelationPair(value)) return matches(value.value, expected)
  if (isPlainObject(value)) return value.id !== undefined && String(value.id) === expected
  return value !== undefined && value !== null && String(value) === expected
}

/** True when the `$visible` condition holds for the context. `false` counts as empty. */
export function isVisible(context: TemplateContext, condition: string, options?: BindingOptions): boolean {
  const { path, test, value: expected } = conditionOf(condition)
  const value = expressionValue(context, path, options)
  const filled = !isMissing(value) && value !== false
  if (test === 'filled') return filled
  if (test === 'empty') return !filled
  return matches(value, expected) === (test === 'equals')
}

/**
 * Resolves one block's bindings (not its children). Bound props with a value take it; applied
 * bindings are removed from the result, unresolved ones stay. A `$visible` binding that does not
 * hold makes the block `hidden`. A Field block gets `props.value`, a repeat its rows (`$items`).
 * Returns the same block when nothing changes.
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

  let hidden = false
  for (const [propPath, fieldPath] of Object.entries(block.bindings ?? {})) {
    if (propPath === VISIBLE_BINDING) {
      hidden = !isVisible(context, fieldPath, options)
      changed = true
      continue
    }
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

  if (block.type === REPEAT_BLOCK) {
    props = { ...props, [LIST_ITEMS_PROP]: repeatRows(context, props) }
    changed = true
  }

  if (!changed) return block
  const next: Block = { ...block, props }
  if (hidden) next.hidden = true
  if (Object.keys(left).length > 0) next.bindings = left
  else delete next.bindings
  return next
}

/**
 * Resolves every block's bindings against the context document. Repeats get their rows
 * (`$items`). The `item` slot of a collection list or a repeat is left alone: its blocks bind to
 * each listed document or row at render time. Applied bindings are removed, so resolving twice
 * is safe. Never mutates.
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
          isRepeatSlot(next.type, name) ? children : visit(children),
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

/** `fields` with the `prefix.` taken off every path (children included). */
function relativeTo(fields: readonly BindingField[], prefix: string): BindingField[] {
  return fields.map((field) => {
    const out: BindingField = { ...field, path: field.path.startsWith(`${prefix}.`) ? field.path.slice(prefix.length + 1) : field.path }
    if (field.children) out.children = relativeTo(field.children, prefix)
    return out
  })
}

/** `fields` under a virtual root (`$parent`, `$page`) as one group, without other virtual paths. Null when empty. */
function underRoot(root: string, label: string, fields: readonly BindingField[] | undefined): BindingField | null {
  const own = (fields ?? []).filter((field) => !field.path.startsWith('$'))
  if (own.length === 0) return null
  const prefix = (list: readonly BindingField[]): BindingField[] =>
    list.map((field) => {
      const out: BindingField = { ...field, path: `${root}.${field.path}` }
      if (field.children) out.children = prefix(field.children)
      return out
    })
  return { path: root, label, type: 'group', children: prefix(own) }
}

/**
 * The bindable fields inside a list block's `item` slot. A collection list: its collection's
 * sources. A repeat: `$item`, `$index`, the row's fields (the related collection's sources for a
 * relationship or upload to one collection, with `$url` only when the repeat's `collection` names
 * it; else the field's children, an array row) and `$parent` (the fields around it). Both get
 * `$page` (the page document's `page` fields) when given. `fields` are the sources around the
 * block. Undefined when unknown.
 */
export function itemSources(
  block: Block,
  fields: readonly BindingField[] | undefined,
  sources: Record<string, readonly BindingField[]>,
  page?: readonly BindingField[],
): BindingField[] | undefined {
  const pageGroup = underRoot(PAGE_PATH, 'Page', page)
  if (block.type === COLLECTION_LIST_BLOCK) {
    const collection = block.props?.collection
    const listed = typeof collection === 'string' && collection ? sources[collection] : undefined
    return listed ? [...listed, ...(pageGroup ? [pageGroup] : [])] : undefined
  }
  const path = typeof block.props?.path === 'string' ? block.props.path.trim() : ''
  const field = path && fields ? findBindingField(fields, path) : undefined
  if (!field) return undefined
  const relationTo = typeof field.relationTo === 'string' ? field.relationTo : undefined
  const related = relationTo
    ? sources[relationTo]?.filter((f) => f.path !== URL_PATH || block.props?.collection === relationTo)
    : undefined
  const { hasMany: _hasMany, children: _children, ...row } = field
  const parentGroup = underRoot(PARENT_PATH, 'Enclosing document', fields)
  return [
    { ...row, path: ITEM_PATH, label: 'This row' },
    { path: INDEX_PATH, label: 'Row number', type: 'number' },
    ...(related ?? relativeTo(field.children ?? [], field.path)),
    ...(parentGroup ? [parentGroup] : []),
    ...(pageGroup ? [pageGroup] : []),
  ]
}

/** The collection lists and repeats whose `item` slot holds the block, outermost first. */
export function repeatAncestors(layout: Layout, id: string): Block[] {
  const path: Array<{ block: Block; slot: string }> = []
  const visit = (blocks: Block[]): boolean => {
    for (const block of blocks) {
      if (block.id === id) return true
      for (const [slot, children] of Object.entries(block.slots ?? {})) {
        path.push({ block, slot })
        if (visit(children)) return true
        path.pop()
      }
    }
    return false
  }
  if (!visit(layout.blocks)) return []
  return path.filter(({ block, slot }) => isRepeatSlot(block.type, slot)).map(({ block }) => block)
}

/**
 * The bindable fields a block reads: the template collection's sources, narrowed by every
 * collection list and repeat around it. Undefined when unknown (no collection, or a repeat path
 * missing from the sources).
 */
export function scopeSources(
  layout: Layout,
  id: string,
  sources: Record<string, readonly BindingField[]>,
  collection: string | null,
): BindingField[] | undefined {
  const page = collection ? sources[collection] : undefined
  let fields: BindingField[] | undefined = page?.slice()
  for (const repeat of repeatAncestors(layout, id)) fields = itemSources(repeat, fields, sources, page)
  return fields
}

/**
 * Checks every binding against the bindable fields of the document it reads: the template's
 * target collection, inside a collection list's `item` slot the listed collection, and inside a
 * repeat's `item` slot the row (`itemSources`). Problems have the code `binding` (they block
 * publishing only). Paths missing from `sources` are left alone: the renderer keeps the literal
 * value. `$item`, `$index`, `$visible` and expressions are always allowed.
 */
export function validateBindings(
  layout: Layout,
  blocks: readonly BlockDefinition[],
  sources: Record<string, readonly BindingField[]>,
  collection: string | null,
): LayoutError[] {
  const definitions = new Map(blocks.map((d) => [d.type, d]))
  const errors: LayoutError[] = []
  const visit = (list: Block[], path: string, fields: readonly BindingField[] | undefined) => {
    list.forEach((block, i) => {
      const at = `${path}[${i}]`
      const definition = definitions.get(block.type)
      if (definition && fields) {
        for (const [propPath, fieldPath] of Object.entries(block.bindings ?? {})) {
          // Expressions (templates, fallbacks, formatters), `$visible` and the row's own value are not checked.
          if (propPath === VISIBLE_BINDING || isBindingExpression(fieldPath)) continue
          if (fieldPath.split('.')[0] === ITEM_PATH || fieldPath === INDEX_PATH) continue
          const source = fieldPath === URL_PATH ? { path: URL_PATH, label: 'Page URL', type: 'text' } : findBindingField(fields, fieldPath)
          if (!source) continue
          const problem = bindingProblem(definition.fields as unknown[], propPath, source)
          if (problem) {
            errors.push({ blockId: block.id, path: `${at}.bindings.${propPath}`, message: `Cannot bind "${propPath}" to "${fieldPath}": ${problem}`, code: 'binding' })
          }
        }
      }
      for (const [name, children] of Object.entries(block.slots ?? {})) {
        visit(children, `${at}.slots.${name}`, isRepeatSlot(block.type, name) ? itemSources(block, fields, sources, page) : fields)
      }
    })
  }
  const page = collection ? sources[collection] : undefined
  visit(layout.blocks, 'blocks', page)
  return errors
}
