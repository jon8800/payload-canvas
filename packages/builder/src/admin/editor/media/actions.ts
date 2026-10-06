'use client'

// Editing images on the canvas, admin side. The canvas reports the upload props under the pointer
// (`imageHover`), a double-click (`imageEdit`) and a dropped file (`imageDrop`). Every change of
// the layout is one `update` operation through the store, so it is one undo step and syncs to
// collaborators like any edit. Alt text of a media document is the one change outside the layout:
// it is saved on the document over REST.

import { dataFields, findBlock, getBlockDefinition } from '../../../core'
import { textOf } from '../../../core/fields'
import type { Block, BlockDefinition } from '../../../core/types'
import type { CanvasImageTarget } from '../../../protocol'
import { lockedMessage } from '../fields/accessRules'
import type { Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'
import { altFromFileName, removeOp, uploadFieldAt, uploadValue, type UploadSpotField } from './model'
import { inlineUpdate } from '../inline'

export type ImageEditorState = {
  /** The upload props under the pointer. */
  hover: CanvasImageTarget | null
  /** A file is dragged over `hover`. */
  dropping: boolean
  /** The media popover: its target, the spot it edits (index into `target.spots`), and when it was asked for. */
  open: { target: CanvasImageTarget; spot: number; at: number } | null
  /** An upload in progress, shown on the image. */
  busy: { id: string; path: string } | null
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

/** What the editor needs to edit the upload at `path` of a block. */
export type ImageSpotContext = {
  block: Block
  definition: BlockDefinition
  spot: UploadSpotField
  /** "Photo", or "Image · Gallery Items 4" inside an array row. */
  label: string
}

const humanize = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
const labelOf = (field: { label?: unknown; name?: string }) => textOf(field.label) ?? humanize(field.name ?? '')

/** The block, its definition and the upload field behind a canvas image, or null when one is gone. */
export function imageSpotContext(runtime: Runtime, blockId: string, path: string): ImageSpotContext | null {
  // The block as the canvas shows it (the editor's locale): the store writes that locale.
  const block = findBlock(runtime.store.getState().view, blockId)
  const definition = block ? getBlockDefinition(runtime.config.blocks, block.type) : undefined
  const spot = definition ? uploadFieldAt(definition, path) : null
  if (!block || !definition || !spot) return null
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
  return { block, definition, spot, label: row ? `${own} · ${row}` : own }
}

/** Refuses a change the user may not make (field access) and says why. True when it refused. */
function refused(runtime: Runtime, context: ImageSpotContext, path: string): boolean {
  const text = lockedMessage(runtime, context.block, path)
  if (text) runtime.warn(text)
  return Boolean(text)
}

/** Sets the stored value of the upload at `path` (an id, or `{ relationTo, value }`): one undo step. */
export function setImageValue(runtime: Runtime, blockId: string, path: string, value: unknown): boolean {
  const context = imageSpotContext(runtime, blockId, path)
  if (!context) {
    runtime.warn('That image is gone: someone changed the page. Try again.')
    return false
  }
  if (refused(runtime, context, path)) return false
  const op = inlineUpdate(context.block, path, value)
  return op ? runtime.store.apply(op) : true
}

/** Sets a media document on the upload at `path`: one undo step. */
export function setImage(runtime: Runtime, blockId: string, path: string, collection: string, id: string | number): boolean {
  const context = imageSpotContext(runtime, blockId, path)
  return context ? setImageValue(runtime, blockId, path, uploadValue(context.spot, collection, id)) : false
}

/** Empties the upload at `path` (removes the item of a hasMany upload): one undo step. */
export function removeImage(runtime: Runtime, blockId: string, path: string): boolean {
  const context = imageSpotContext(runtime, blockId, path)
  if (!context || refused(runtime, context, path)) return false
  const op = removeOp(context.block, path, context.spot)
  return op ? runtime.store.apply(op) : false
}

/** Sets a text prop (alt text next to the upload). Typing in one field merges into one undo step. */
export function setAltProp(runtime: Runtime, blockId: string, path: string, value: string): void {
  const block = findBlock(runtime.store.getState().view, blockId)
  if (!block) return
  const text = lockedMessage(runtime, block, path)
  if (text) {
    runtime.warn(text)
    return
  }
  const op = inlineUpdate(block, path, value)
  if (op) runtime.store.apply(op, { mergeKey: `alt:${blockId}:${path}` })
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
export async function uploadImage(runtime: Runtime, blockId: string, path: string, file: File): Promise<boolean> {
  const context = imageSpotContext(runtime, blockId, path)
  if (!context || refused(runtime, context, path)) return false
  const collection = context.spot.collections[0]
  if (!collection) return false
  updateImageEditor(runtime, { busy: { id: blockId, path } })
  try {
    const doc = await uploadMedia(runtime, collection, file)
    if (!setImage(runtime, blockId, path, collection, doc.id)) return false
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
