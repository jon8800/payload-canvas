// Pure helpers for templates and data binding in the editor: which document fields a block prop
// can bind to, the picker rows, and sample values for previews. No React here, so they are unit tested.

import { isLinkField } from '../../../blocks/link'
import {
  COLLECTION_LIST_BLOCK,
  FIELD_BLOCK,
  getByPath,
  isIsoDate,
  isUploadDoc,
  LIST_ITEM_SLOT,
  titleOf,
  toPlainText,
  URL_PATH,
} from '../../../core/bindings'
import type { BindingField, Block, Layout } from '../../../core/types'

export { FIELD_BLOCK, URL_PATH }
/** Block type of the collection list block. Blocks in its `item` slot bind to each item. */
export const LIST_BLOCK = COLLECTION_LIST_BLOCK
export const LIST_SLOT = LIST_ITEM_SLOT

/** The `$url` virtual field: the frontend URL of the document (each item's, inside a list). */
export function urlField(scope: 'template' | 'list'): BindingField {
  return { path: URL_PATH, label: scope === 'list' ? 'URL of this item' : 'URL of this document', type: '$url' }
}
export const URL_FIELD = urlField('list')

/**
 * What a block prop can show, by its Payload field type. `link` is a whole link group (bound to a
 * URL). `any` is the Field block's path picker.
 */
export type PropKind = 'text' | 'link' | 'richText' | 'upload' | 'number' | 'date' | 'relationship' | 'any'

type PropField = { type: string; hasMany?: boolean; relationTo?: string | string[]; admin?: unknown }

/** The binding kind of a block prop, or null when the prop cannot be bound. */
export function propKind(field: PropField): PropKind | null {
  if (field.hasMany) return null
  if (isLinkField(field)) return 'link'
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'code':
      return 'text'
    case 'richText':
      return 'richText'
    case 'upload':
      return 'upload'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'relationship':
      return 'relationship'
    default:
      return null
  }
}

/** Field types a text prop can show. Rich text shows as plain text. */
const TEXT_SOURCES = new Set(['text', 'textarea', 'email', 'number', 'date', 'select', 'radio', 'richText', 'code', '$url'])
/** Field types a link group can take its URL from. */
const LINK_SOURCES = new Set(['text', 'email', 'select', 'radio', 'code', '$url'])

const asList = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

/** True when the two relationTo settings share a collection, or either one is unknown. */
function sameTarget(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  const left = asList(a)
  const right = asList(b)
  return left.length === 0 || right.length === 0 || left.some((slug) => right.includes(slug))
}

/** True when a prop of `kind` can bind to `source`. Containers (group, array) never bind themselves, except for `any`. */
export function isCompatible(kind: PropKind, source: BindingField, prop?: PropField): boolean {
  if (kind === 'any') return true
  if (source.hasMany && source.type !== 'select') return false
  switch (kind) {
    case 'text':
      return TEXT_SOURCES.has(source.type) && !(source.type === 'select' && source.hasMany)
    case 'link':
      return LINK_SOURCES.has(source.type) && !source.hasMany
    case 'richText':
      return source.type === 'richText'
    case 'number':
      return source.type === 'number'
    case 'date':
      return source.type === 'date'
    case 'upload':
      return source.type === 'upload' && sameTarget(source.relationTo, prop?.relationTo)
    case 'relationship':
      return source.type === 'relationship' && sameTarget(source.relationTo, prop?.relationTo)
  }
}

/** Fields of a related document that are bookkeeping, not content. Hidden after a relationship hop. */
const HOP_NOISE = new Set(['id', 'createdAt', 'updatedAt', 'mimeType', 'filesize', 'focalX', 'focalY', 'thumbnailURL', 'sizes', '_status', 'hash', 'salt'])

/** Children the picker can walk into: groups, and one relationship hop. Array rows have no single value. */
function walkableChildren(field: BindingField): BindingField[] {
  if (!field.children || field.children.length === 0) return []
  if (field.type === 'array') return []
  const hop = field.type === 'relationship' || field.type === 'upload'
  if (hop && field.hasMany) return []
  return hop ? field.children.filter((child) => !HOP_NOISE.has(child.path.slice(child.path.lastIndexOf('.') + 1))) : field.children
}

export type PickerRow = {
  field: BindingField
  depth: number
  /** False for group headers that only hold matching children. */
  selectable: boolean
  /** Path segments' labels, e.g. ["Author", "Name"]. */
  trail: string[]
}

/**
 * The rows of the field picker, depth first. Keeps a field when it is compatible and matches the
 * query, and keeps a container when anything inside it does.
 */
export function pickerRows(fields: BindingField[], accept: (field: BindingField) => boolean, query = ''): PickerRow[] {
  const q = query.trim().toLowerCase()
  const matches = (field: BindingField, trail: string[]) =>
    !q || field.path.toLowerCase().includes(q) || trail.join(' ').toLowerCase().includes(q)

  const visit = (list: BindingField[], depth: number, parents: string[]): PickerRow[] => {
    const out: PickerRow[] = []
    for (const field of list) {
      const trail = [...parents, field.label]
      const children = visit(walkableChildren(field), depth + 1, trail)
      const own = accept(field) && matches(field, trail)
      if (!own && children.length === 0) continue
      out.push({ field, depth, selectable: own, trail })
      out.push(...children)
    }
    return out
  }
  return visit(fields, 0, [])
}

/** Finds a binding field by its dot path, walking groups and the relationship hop. */
export function findBindingField(fields: BindingField[], path: string): BindingField | null {
  for (const field of fields) {
    if (field.path === path) return field
    if (field.children && path.startsWith(`${field.path}.`)) {
      const found = findBindingField(field.children, path)
      if (found) return found
    }
  }
  return null
}

/** Labels from the root to the field, e.g. ["Author", "Name"]. Falls back to the path segments. */
export function bindingTrail(fields: BindingField[], path: string): string[] {
  const trail: string[] = []
  let list = fields
  for (;;) {
    const field = list.find((f) => f.path === path || path.startsWith(`${f.path}.`))
    if (!field) break
    trail.push(field.label)
    if (field.path === path) return trail
    list = field.children ?? []
  }
  return path.split('.')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The value at a dot path in a document loaded with depth 1, read the same way the renderer reads
 * it: groups, populated relationships (polymorphic pairs too) and arrays.
 */
export function valueAt(doc: Record<string, unknown> | null | undefined, path: string): unknown {
  return doc ? getByPath(doc, path) : undefined
}

export type SamplePreview =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; alt: string }

const MAX_PREVIEW = 120

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_PREVIEW ? `${flat.slice(0, MAX_PREVIEW - 1)}…` : flat
}

/** The best URL to show an upload document small. */
function uploadUrl(doc: Record<string, unknown>): string | null {
  const sizes = isRecord(doc.sizes) ? doc.sizes : {}
  for (const size of ['thumbnail', 'card', 'small']) {
    const entry = sizes[size]
    if (isRecord(entry) && typeof entry.url === 'string' && entry.url) return entry.url
  }
  if (typeof doc.thumbnailURL === 'string' && doc.thumbnailURL) return doc.thumbnailURL
  if (typeof doc.url === 'string' && doc.url) return doc.url
  return null
}

/** A document's display title: the collection's title field, then common title fields, then the id. */
export function docTitle(doc: unknown, titleField?: string): string {
  if (titleField && isRecord(doc)) {
    const value = doc[titleField]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const title = titleOf(doc)
  if (!title) return ''
  return isRecord(doc) && title === String(doc.id) ? `#${title}` : title
}

/** A short preview of a sample value: an image for uploads, else the text the renderer would show. */
export function previewValue(value: unknown, type: string): SamplePreview {
  const one = Array.isArray(value) && value.length === 1 ? value[0] : value
  const doc = isRecord(one) && typeof one.relationTo === 'string' && isRecord(one.value) ? one.value : one
  if ((type === 'upload' || isUploadDoc(doc)) && isRecord(doc)) {
    const url = uploadUrl(doc)
    if (url) return { kind: 'image', url, alt: typeof doc.alt === 'string' ? doc.alt : docTitle(doc) }
  }
  if (type === 'group' && isRecord(value)) return { kind: 'text', text: '{…}' }
  if (type === 'date' && !isIsoDate(value) && typeof value === 'string') return { kind: 'text', text: clip(value) }
  const text = toPlainText(value)
  return text ? { kind: 'text', text: clip(text) } : { kind: 'empty' }
}

/**
 * The nearest collection list whose `item` slot holds the block (directly or deeper).
 * Null when the block is not inside a list item. A list block is not inside its own item.
 */
export function listAncestor(layout: Layout, id: string): Block | null {
  const path: Block[] = []
  const visit = (blocks: Block[]): boolean => {
    for (const block of blocks) {
      path.push(block)
      if (block.id === id) return true
      for (const children of Object.values(block.slots ?? {})) {
        if (visit(children)) return true
      }
      path.pop()
    }
    return false
  }
  if (!visit(layout.blocks)) return null
  for (let i = path.length - 2; i >= 0; i--) {
    const parent = path[i]!
    const child = path[i + 1]!
    if (parent.type === LIST_BLOCK && parent.slots?.[LIST_SLOT]?.some((b) => b.id === child.id)) return parent
  }
  return null
}

/** The prop path of an inspector input path (`builder.<id>.link.url` -> `link.url`). Null inside array rows. */
export function propPathOf(prefix: string, path: string): string | null {
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length)
  if (!rest || rest.split('.').some((segment) => /^\d+$/.test(segment))) return null
  return rest
}

type LooseField = { type: string; name?: string; hasMany?: boolean; fields?: LooseField[]; tabs?: { fields?: LooseField[] }[] }

/** True when any prop of the block (groups and layout fields included, arrays not) can bind. */
export function hasBindableField(fields: readonly LooseField[]): boolean {
  return fields.some((field) => {
    if (field.type === 'array') return false
    if (field.type === 'tabs') return (field.tabs ?? []).some((tab) => hasBindableField(tab.fields ?? []))
    if (field.fields) return hasBindableField(field.fields)
    return propKind(field) !== null
  })
}
