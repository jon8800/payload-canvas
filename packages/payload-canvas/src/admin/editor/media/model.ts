// Pure helpers for editing images on the canvas: the upload field behind a prop path, the value a
// picked media document becomes, the operation that sets or removes it, and where alt text lives.
// No React and no DOM, so the tests run in Node.

import { fieldAtPropPath, type DataField } from '../../../core'
import type { Block, BlockDefinition, Operation } from '../../../core/types'
import { inlineUpdate } from '../inline'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The upload field behind a canvas image path. */
export type UploadSpotField = {
  field: DataField
  /** Collections the field takes. The first one is where uploads go. */
  collections: string[]
  polymorphic: boolean
  /** The path picks one value of a hasMany upload ("gallery.2"). */
  item: boolean
  required: boolean
}

/** The upload field a prop path points at ("photo", "items.3.image", "gallery.2"), or null. */
export function uploadFieldAt(definition: BlockDefinition | undefined, path: string): UploadSpotField | null {
  const field = definition ? fieldAtPropPath(definition.fields, path) : undefined
  if (!field || field.type !== 'upload' || !field.relationTo) return null
  const item = Boolean(field.hasMany) && /\.\d+$/.test(path)
  if (field.hasMany && !item) return null
  const polymorphic = Array.isArray(field.relationTo)
  return {
    field,
    collections: polymorphic ? [...(field.relationTo as string[])] : [field.relationTo as string],
    polymorphic,
    item,
    required: Boolean(field.required),
  }
}

/** The stored value for a media document: its id, or `{ relationTo, value }` for a polymorphic field. */
export function uploadValue(spot: UploadSpotField, collection: string, id: string | number): unknown {
  return spot.polymorphic ? { relationTo: collection, value: id } : id
}

const idOf = (v: unknown): string | number | null =>
  typeof v === 'string' || typeof v === 'number' ? v : isRecord(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? v.id : null

/** The media document a stored upload value points at, or null. */
export function mediaRef(spot: UploadSpotField, value: unknown): { collection: string; id: string | number } | null {
  if (spot.polymorphic) {
    if (!isRecord(value) || typeof value.relationTo !== 'string') return null
    const id = idOf(value.value)
    return id === null ? null : { collection: value.relationTo, id }
  }
  const id = idOf(value)
  return id === null ? null : { collection: spot.collections[0] ?? '', id }
}

/**
 * The operation that empties the upload at `path`: null for a single upload, the list without the
 * item for one value of a hasMany upload.
 */
export function removeOp(block: Block, path: string, spot: UploadSpotField): Extract<Operation, { type: 'update' }> | null {
  if (!spot.item) return inlineUpdate(block, path, null)
  const cut = path.lastIndexOf('.')
  const listPath = path.slice(0, cut)
  const index = Number(path.slice(cut + 1))
  let list: unknown = block.props
  for (const segment of listPath.split('.')) list = Array.isArray(list) ? list[Number(segment)] : isRecord(list) ? list[segment] : undefined
  if (!Array.isArray(list) || index >= list.length) return null
  return inlineUpdate(block, listPath, list.filter((_, i) => i !== index))
}

/**
 * A text prop next to the upload that holds its alt text (`alt`, `altText`, `<name>Alt`), or null.
 * Without one, the alt text is the media document's own `alt` field.
 */
export function altPropPath(definition: BlockDefinition | undefined, path: string): string | null {
  if (!definition) return null
  const cut = path.lastIndexOf('.')
  const parent = cut === -1 ? '' : path.slice(0, cut)
  const name = path.slice(cut + 1)
  if (/^\d+$/.test(name)) return null
  for (const candidate of [`${name}Alt`, `${name}AltText`, 'alt', 'altText']) {
    const altPath = parent ? `${parent}.${candidate}` : candidate
    const field = fieldAtPropPath(definition.fields, altPath)
    if (field && (field.type === 'text' || field.type === 'textarea')) return altPath
  }
  return null
}

/** A readable name for a file ("sunset-over-the-bay.jpg" becomes "Sunset over the bay"), used as alt text of an upload. */
export function altFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : ''
}

/** The stored value at a prop path ("photo", "items.3.image", "gallery.2"), or undefined. */
export function propAt(props: Record<string, unknown> | undefined, path: string): unknown {
  let current: unknown = props
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)]
    else if (isRecord(current)) current = current[segment]
    else return undefined
  }
  return current
}
