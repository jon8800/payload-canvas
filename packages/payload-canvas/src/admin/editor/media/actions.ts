'use client'

// Editing images on the canvas, admin side. The canvas reports the upload props under the pointer
// (`imageHover`), a double-click (`imageEdit`) and a dropped file (`imageDrop`). Every change of
// the layout is one `update` operation through the store, so it is one undo step and syncs to
// collaborators like any edit. Alt text of a media document is the one change outside the layout:
// it is saved on the document over REST. An image of a page region shows a document field: its
// change is saved to the document (`runtime.regions`), also one undo step.

import { dataFields, findBlock, getBlockDefinition } from '../../../core'
import { textOf } from '../../../core/fields'
import type { Block, BlockDefinition } from '../../../core/types'
import type { CanvasImageTarget } from '../../../protocol'
import { lockedMessage } from '../fields/accessRules'
import { ownerKey, type CanvasOwner } from '../regions/select'
import type { Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'
import { altFromFileName, removeChange, removeOp, uploadFieldAt, uploadValue, type UploadSpotField } from './model'
import { inlineUpdate } from '../inline'

export type ImageEditorState = {
  /** The upload props under the pointer. */
  hover: CanvasImageTarget | null
  /** A file is dragged over `hover`. */
  dropping: boolean
  /** The media popover: its target, the spot it edits (index into `target.spots`), and when it was asked for. */
  open: { target: CanvasImageTarget; spot: number; at: number } | null
  /** An upload in progress, shown on the image. `key`: the owner's key (`ownerKey`). */
  busy: { key: string; path: string } | null
}

const stores = new WeakMap<Runtime, ValueStore<ImageEditorState>>()

/** The image editing state of this editor. */
export function imageEditor(runtime: Runtime): ValueStore<ImageEditorState> {
  let store = stores.get(runtime)
  if (!store) {
    store = createValueStore<ImageEditorState>({ hover: null, dropping: false, open: null, busy: null })
    stores.set(runtime, store)
  }
  return store
}

export function updateImageEditor(runtime: Runtime, change: Partial<ImageEditorState>) {
  const store = imageEditor(runtime)
  store.set({ ...store.get(), ...change })
}

/** What the editor needs to edit the upload at `path` of a block or a region. */
export type ImageSpotContext = {
  /** The block, or for a region its values as block props (no id). */
  block: Block
  definition: BlockDefinition
  spot: UploadSpotField
  /** "Photo", or "Image · Gallery Items 4" inside an array row. */
  label: string
  /** The region, when the image shows a document field. */
  region?: string
}

const humanize = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
const labelOf = (field: { label?: unknown; name?: string }) => textOf(field.label) ?? humanize(field.name ?? '')

/** The block (or the region's values) and the definition behind a canvas image owner. */
function ownerData(runtime: Runtime, owner: CanvasOwner): { block: Block; definition: BlockDefinition } | null {
  if (owner.region) {
    const definition = runtime.regions?.definition(owner.region)
    const values = runtime.regions?.state.get().values
    return definition && values ? { block: { id: '', type: definition.type, props: values }, definition } : null
  }
  // The block as the canvas shows it (the editor's locale): the store writes that locale.
  const block = findBlock(runtime.store.getState().view, owner.id)
  const definition = block ? getBlockDefinition(runtime.config.blocks, block.type) : undefined
  return block && definition ? { block, definition } : null
}

/** The block, its definition and the upload field behind a canvas image, or null when one is gone. */
export function imageSpotContext(runtime: Runtime, owner: CanvasOwner, path: string): ImageSpotContext | null {
  const data = ownerData(runtime, owner)
  const spot = data ? uploadFieldAt(data.definition, path) : null
  if (!data || !spot) return null
  const { block, definition } = data
  // The deepest array row on the path names the item ("Gallery Items 4").
  const segments = path.split('.')
  let row = ''
  let fields: readonly unknown[] = definition.fields
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (/^\d+$/.test(segment)) continue
    const field = dataFields(fields).find((f) => f.name === segment)
    if (!field) break
    if (field.type === 'array' && /^\d+$/.test(segments[i + 1] ?? '')) row = `${labelOf(field)} ${Number(segments[i + 1]) + 1}`
    fields = field.fields ?? []
  }
  const own = labelOf(spot.field)
  return { block, definition, spot, label: row ? `${own} · ${row}` : own, ...(owner.region ? { region: owner.region } : {}) }
}

/** Why the user may not change `path` of the owner now, or null. */
function lockedFor(runtime: Runtime, context: Pick<ImageSpotContext, 'block' | 'region'>, path: string): string | null {
  // `null` from `lockedMessage` means allowed: only a missing regions controller is a refusal.
  if (context.region) return runtime.regions ? runtime.regions.lockedMessage(path) : 'This page has no regions.'
  return lockedMessage(runtime, context.block, path)
}

/** Refuses a change the user may not make (field access) and says why. True when it refused. */
function refused(runtime: Runtime, context: ImageSpotContext, path: string): boolean {
  const text = lockedFor(runtime, context, path)
  if (text) runtime.warn(text)
  return Boolean(text)
}

/** Writes one value: an `update` operation for a block, a document field save for a region. One undo step. */
function writeValue(runtime: Runtime, context: ImageSpotContext, path: string, value: unknown): boolean {
  if (context.region) {
    if (!runtime.regions) return false
    void runtime.regions.write([{ path, value }])
    return true
  }
  const op = inlineUpdate(context.block, path, value)
  return op ? runtime.store.apply(op) : true
}

/** Sets the stored value of the upload at `path` (an id, or `{ relationTo, value }`): one undo step. */
export function setImageValue(runtime: Runtime, owner: CanvasOwner, path: string, value: unknown): boolean {
  const context = imageSpotContext(runtime, owner, path)
  if (!context) {
    runtime.warn('That image is gone: someone changed the page. Try again.')
    return false
  }
  if (refused(runtime, context, path)) return false
  return writeValue(runtime, context, path, value)
}

/** Sets a media document on the upload at `path`: one undo step. */
export function setImage(runtime: Runtime, owner: CanvasOwner, path: string, collection: string, id: string | number): boolean {
  const context = imageSpotContext(runtime, owner, path)
  return context ? setImageValue(runtime, owner, path, uploadValue(context.spot, collection, id)) : false
}

/** Empties the upload at `path` (removes the item of a hasMany upload): one undo step. */
export function removeImage(runtime: Runtime, owner: CanvasOwner, path: string): boolean {
  const context = imageSpotContext(runtime, owner, path)
  if (!context || refused(runtime, context, path)) return false
  if (context.region) {
    const change = removeChange(context.block.props, path, context.spot)
    return change ? writeValue(runtime, context, change.path, change.value) : false
  }
  const op = removeOp(context.block, path, context.spot)
  return op ? runtime.store.apply(op) : false
}

/** Sets a text prop (alt text next to the upload). Typing in one field merges into one undo step. */
export function setAltProp(runtime: Runtime, owner: CanvasOwner, path: string, value: string): void {
  const data = ownerData(runtime, owner)
  if (!data) return
  const text = lockedFor(runtime, { block: data.block, region: owner.region }, path)
  if (text) {
    runtime.warn(text)
    return
  }
  // A region's alt text is a document field: saved when the input is done (blur or Enter).
  if (owner.region) {
    void runtime.regions?.write([{ path, value }])
    return
  }
  const op = inlineUpdate(data.block, path, value)
  if (op) runtime.store.apply(op, { mergeKey: `alt:${owner.id}:${path}` })
}

type Doc = Record<string, unknown> & { id: string | number }

const errorOf = (body: unknown, status: number, action: string): string => {
  const errors = (body as { errors?: Array<{ message?: string }> } | null)?.errors
  const message = errors?.[0]?.message
  return message ? `${action} failed: ${message}` : `${action} failed (HTTP ${status}).`
}

/** Uploads a file to an upload collection as the signed-in user. Alt text defaults to the file name. */
export async function uploadMedia(runtime: Runtime, collection: string, file: File): Promise<Doc> {
  const form = new FormData()
  form.append('file', file)
  form.append('_payload', JSON.stringify({ alt: altFromFileName(file.name) }))
  const response = await fetch(`${runtime.api}/${encodeURIComponent(collection)}`, { method: 'POST', credentials: 'include', body: form })
  const body = (await response.json().catch(() => null)) as { doc?: Doc } | null
  if (!response.ok || !body?.doc) throw new Error(errorOf(body, response.status, 'The upload'))
  return body.doc
}

/** Uploads `file` and sets it on the upload at `path`. Shows progress on the image and the result. */
export async function uploadImage(runtime: Runtime, owner: CanvasOwner, path: string, file: File): Promise<boolean> {
  const context = imageSpotContext(runtime, owner, path)
  if (!context || refused(runtime, context, path)) return false
  const collection = context.spot.collections[0]
  if (!collection) return false
  updateImageEditor(runtime, { busy: { key: ownerKey(owner), path } })
  try {
    const doc = await uploadMedia(runtime, collection, file)
    if (!setImage(runtime, owner, path, collection, doc.id)) return false
    runtime.notify(`Uploaded ${file.name}`)
    return true
  } catch (error) {
    runtime.warn(error instanceof Error ? error.message : String(error))
    return false
  } finally {
    updateImageEditor(runtime, { busy: null })
  }
}

/** A media document with its alt text and preview URL, or null. */
export async function loadMedia(runtime: Runtime, collection: string, id: string | number): Promise<Doc | null> {
  const params = new URLSearchParams({ depth: '0' })
  const response = await fetch(`${runtime.api}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}?${params}`, {
    credentials: 'include',
  })
  if (!response.ok) return null
  return ((await response.json().catch(() => null)) as Doc | null) ?? null
}

/**
 * Saves the alt text on the media document (it changes everywhere the image is used) and tells the
 * canvas to load the document again.
 */
export async function saveMediaAlt(runtime: Runtime, collection: string, id: string | number, alt: string): Promise<void> {
  const response = await fetch(`${runtime.api}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alt }),
  })
  const body = (await response.json().catch(() => null)) as { doc?: Doc } | null
  if (!response.ok) throw new Error(errorOf(body, response.status, 'Saving the alt text'))
  if (body?.doc && body.doc.alt !== alt) throw new Error(`The ${collection} collection has no alt text field.`)
  runtime.postToCanvas({ type: 'docChanged', collection, id })
}
