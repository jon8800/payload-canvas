// References: the documents a layout points at. Uploads, relationships, link groups and the
// upload, relationship and internal link nodes of rich text. The plugin stores them in a hidden
// relationship field, so Payload knows which pages use which media and documents.

import { isLinkField } from '../blocks/link'
import { dataFields, fieldBlocks, type LooseField } from './fields'
import { isPlainObject, walkBlocks } from './tree'
import type { BlockDefinition, Layout } from './types'

/** One referenced document, in the shape of a polymorphic relationship value. */
export type Reference = { relationTo: string; value: string | number }

/** The collections block fields can point at. `richText` is true when a block has a rich text prop. */
export type ReferenceTargets = { collections: string[]; richText: boolean }

/** A stable key of a reference. "5" and 5 give the same key. */
export function referenceKey(ref: Reference): string {
  return `${ref.relationTo}:${String(ref.value)}`
}

/** An ID, or the ID of a populated document. `null` for anything else. */
function idOf(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value.trim() ? value : null
  if (isPlainObject(value)) return idOf(value.id)
  return null
}

type Add = (relationTo: string, value: unknown) => void

/** One relationship or upload value: single or hasMany, plain or polymorphic. */
function visitRelation(field: LooseField, value: unknown, add: Add): void {
  for (const item of Array.isArray(value) ? value : [value]) {
    if (Array.isArray(field.relationTo)) {
      if (isPlainObject(item) && typeof item.relationTo === 'string' && field.relationTo.includes(item.relationTo)) {
        add(item.relationTo, item.value)
      }
    } else if (typeof field.relationTo === 'string') {
      add(field.relationTo, item)
    }
  }
}

/** Upload and relationship nodes and internal links of Lexical rich text, at any depth. */
function visitLexical(node: unknown, add: Add): void {
  if (!isPlainObject(node)) return
  if ((node.type === 'upload' || node.type === 'relationship') && typeof node.relationTo === 'string') {
    add(node.relationTo, node.value)
  }
  if ((node.type === 'link' || node.type === 'autolink') && isPlainObject(node.fields) && node.fields.linkType !== 'custom') {
    const doc = node.fields.doc
    if (isPlainObject(doc) && typeof doc.relationTo === 'string') add(doc.relationTo, doc.value)
  }
  if (Array.isArray(node.children)) for (const child of node.children) visitLexical(child, add)
}

/** The link type the renderer uses: a group without `type` is a URL link unless only a document is set. */
function linkType(value: Record<string, unknown>): string {
  if (value.type === 'url' || value.type === 'reference') return value.type
  if (typeof value.url === 'string' && value.url) return 'url'
  return value.reference ? 'reference' : 'url'
}

/** Walks props along their field configs: groups, named tabs, arrays and blocks fields too. */
function visitFields(fields: readonly unknown[] | undefined, props: Record<string, unknown>, add: Add): void {
  for (const field of dataFields(fields)) {
    const value = props[field.name]
    if (value === undefined || value === null) continue
    switch (field.type) {
      case 'upload':
      case 'relationship':
        visitRelation(field, value, add)
        break
      case 'richText':
        if (isPlainObject(value)) visitLexical(value.root, add)
        break
      case 'group': {
        if (!isPlainObject(value)) break
        // A URL link may keep an old document choice. It is not shown, so it is not a reference.
        const skipReference = isLinkField(field) && linkType(value) !== 'reference'
        const groupFields = skipReference ? dataFields(field.fields).filter((f) => f.name !== 'reference') : field.fields
        visitFields(groupFields, value, add)
        break
      }
      case 'array':
        if (Array.isArray(value)) for (const row of value) if (isPlainObject(row)) visitFields(field.fields, row, add)
        break
      case 'blocks': {
        if (!Array.isArray(value)) break
        const variants = fieldBlocks(field)
        for (const row of value) {
          if (!isPlainObject(row)) continue
          const variant = variants.find((b) => b.slug === row.blockType)
          if (variant) visitFields(variant.fields, row, add)
        }
        break
      }
    }
  }
}

/**
 * Every document a layout references, in layout order, without duplicates: upload and
 * relationship props (also inside groups, arrays and blocks fields), link groups that point at a
 * document, and upload, relationship and internal link nodes in rich text props. Nested slots and
 * hidden blocks count. Bindings read the rendered document at runtime, so they add nothing; a bound
 * prop's own value is its fallback and counts. Every locale's values count (`block.locales`).
 * Populated values (`{ id, … }`) give their ID.
 */
export function collectReferences(layout: Layout, blocks: readonly BlockDefinition[]): Reference[] {
  const definitions = new Map(blocks.map((definition) => [definition.type, definition]))
  const found = new Map<string, Reference>()
  const add: Add = (relationTo, value) => {
    const id = idOf(value)
    if (id === null) return
    const ref = { relationTo, value: id }
    const key = referenceKey(ref)
    if (!found.has(key)) found.set(key, ref)
  }
  walkBlocks(layout, (block) => {
    const definition = definitions.get(block.type)
    if (!definition) return
    if (block.props) visitFields(definition.fields, block.props, add)
    // Translations hold their own documents (a German image, a German link target).
    for (const values of Object.values(block.locales ?? {})) visitFields(definition.fields, values, add)
  })
  return [...found.values()]
}

/**
 * The collections the blocks' upload, relationship and link fields point at, at any depth, in
 * first-seen order. Rich text can point at more (uploads, internal links): `richText` says a block
 * has a rich text prop, so the plugin can add the upload collections.
 */
export function referenceTargets(blocks: readonly BlockDefinition[]): ReferenceTargets {
  const collections = new Set<string>()
  let richText = false
  const visit = (fields: readonly unknown[] | undefined) => {
    for (const field of dataFields(fields)) {
      if (field.type === 'upload' || field.type === 'relationship') {
        for (const slug of Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]) {
          if (typeof slug === 'string' && slug) collections.add(slug)
        }
      } else if (field.type === 'richText') {
        richText = true
      } else if (field.type === 'group' || field.type === 'array') {
        visit(field.fields)
      } else if (field.type === 'blocks') {
        for (const variant of fieldBlocks(field)) visit(variant.fields)
      }
    }
  }
  for (const block of blocks) visit(block.fields)
  return { collections: [...collections], richText }
}

/** True when both lists hold the same references in the same order ("5" equals 5). */
export function sameReferences(a: readonly Reference[], b: readonly Reference[]): boolean {
  return a.length === b.length && a.every((ref, i) => referenceKey(ref) === referenceKey(b[i]))
}

/**
 * Reads a stored polymorphic relationship value (`[{ relationTo, value }]`, values may be
 * populated documents) as references. Anything else is skipped.
 */
export function readReferences(value: unknown): Reference[] {
  if (!Array.isArray(value)) return []
  const out: Reference[] = []
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.relationTo !== 'string') continue
    const id = idOf(item.value)
    if (id !== null) out.push({ relationTo: item.relationTo, value: id })
  }
  return out
}
