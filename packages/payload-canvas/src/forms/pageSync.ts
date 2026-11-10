// The mapping between a "Build here" Form block on a page and its document in the form-builder
// plugin's forms collection, both ways. Publishing the page writes the block into the document
// (`formDataFromBlock`); "Move into this page" turns a saved form into the block's own content
// (`formBlockFromDoc`). Each document remembers the block it was made from (`source`: collection,
// document id, block id), so a copied page or a duplicated block gets a new document instead of
// changing the original's. Pure, client-safe.

import { isRichText, plainToRichText } from '../core/bindings'
import { createId } from '../core/ids'
import { isPlainObject } from '../core/tree'
import type { Block, BlockDefinition, Layout } from '../core/types'
import { formFieldSlug, formFieldType } from './blocks'
import { FORM_FIELD_CLASS_KEY, FORM_FIELD_PARTS_KEY } from './fieldSettings'
import { FORM_BLOCK, FORM_SLOT, FORM_SUBMIT_BLOCK, formBlockFields, formBlockMode, formIdOf, formSubmitBlocks } from './pageForms'

/** Name of the hidden group on the forms collection that names the block a form was made from. */
export const FORM_SOURCE_FIELD = 'source'

/** The block a form document was made from. */
export type FormSource = { collection: string; document: string; block: string; hash?: string }

/** The message after a sent form when the Form block has none: the same text the site shows then. */
export const DEFAULT_CONFIRMATION = 'Thank you. We will reply soon.'

/** The keys of a field row that are not the field's props. */
const ROW_KEYS = new Set(['id', 'blockType', 'blockName', FORM_FIELD_CLASS_KEY, FORM_FIELD_PARTS_KEY])

/** The "Build here" Form blocks of a layout, in tree order (also inside other blocks). */
export function pageFormBlocks(layout: Layout): Block[] {
  const out: Block[] = []
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.type === FORM_BLOCK) {
        if (formBlockMode(block.props) === 'build') out.push(block)
        continue
      }
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  visit(layout.blocks)
  return out
}

/** One field block as a row of the plugin's `fields` blocks field. Classes go to the class keys. */
export function fieldRowOf(block: Block): Record<string, unknown> {
  const row: Record<string, unknown> = { id: block.id, blockType: formFieldSlug(block.type) }
  for (const [key, value] of Object.entries(block.props ?? {})) {
    if (!ROW_KEYS.has(key) && value !== undefined) row[key] = value
  }
  row.blockName = block.label ?? null
  row[FORM_FIELD_CLASS_KEY] = block.className?.trim() ? block.className : null
  row[FORM_FIELD_PARTS_KEY] = block.partClassName && Object.keys(block.partClassName).length > 0 ? block.partClassName : null
  return row
}

/** One row of the plugin's `fields` blocks field as a field block. */
export function fieldBlockOf(row: Record<string, unknown>): Block | null {
  if (typeof row.blockType !== 'string' || !row.blockType) return null
  const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : createId()
  const block: Block = { id, type: formFieldType(row.blockType) }
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!ROW_KEYS.has(key) && value !== null && value !== undefined) props[key] = value
  }
  if (Object.keys(props).length > 0) block.props = props
  if (typeof row.blockName === 'string' && row.blockName.trim()) block.label = row.blockName
  const className = row[FORM_FIELD_CLASS_KEY]
  if (typeof className === 'string' && className.trim()) block.className = className
  const parts = row[FORM_FIELD_PARTS_KEY]
  if (isPlainObject(parts)) {
    const kept = Object.fromEntries(Object.entries(parts).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''))
    if (Object.keys(kept).length > 0) block.partClassName = kept
  }
  return block
}

export type FormDataOptions = {
  /** The forms collection's setting names (`formSettingNames`): title, submit button, confirmation, emails, groups. */
  settings: readonly string[]
  /** The title when the block has none, e.g. "Contact form" from the page title. */
  fallbackTitle: string
}

/**
 * The forms document data of a "Build here" Form block: its fields in tree order (as the plugin's
 * rows, row id = block id) and its settings. Empty settings stay out, so the collection's defaults
 * apply. The title falls back to `fallbackTitle`; the submit button label to the first Submit
 * button block's label.
 */
export function formDataFromBlock(form: Block, options: FormDataOptions): Record<string, unknown> {
  const props = form.props ?? {}
  const data: Record<string, unknown> = {}
  for (const key of options.settings) {
    const value = props[key]
    if (value !== undefined && value !== null && value !== '') data[key] = value
  }
  const title = typeof props.title === 'string' ? props.title.trim() : ''
  data.title = title || options.fallbackTitle
  if (options.settings.includes('submitButtonLabel') && !data.submitButtonLabel) {
    const label = formSubmitBlocks(form).map((b) => b.props?.label).find((l): l is string => typeof l === 'string' && l.trim() !== '')
    if (label) data.submitButtonLabel = label
  }
  // The form-builder plugin requires a message unless the form redirects: the site's default text.
  if (options.settings.includes('confirmationMessage') && data.confirmationType !== 'redirect' && !data.confirmationMessage) {
    data.confirmationMessage = plainToRichText(DEFAULT_CONFIRMATION)
  }
  data.fields = formBlockFields(form).map(fieldRowOf)
  return data
}

/**
 * The Form block's content made from a forms document ("Move into this page"): the settings as
 * props, "build" mode, the form's id kept, and the fields (row id = block id) followed by a Submit
 * button. `settings`: the setting names to copy.
 */
export function formBlockFromDoc(doc: Record<string, unknown>, settings: readonly string[]): { props: Record<string, unknown>; children: Block[] } {
  const props: Record<string, unknown> = { mode: 'build' }
  const id = formIdOf(doc)
  if (id !== null) props.form = id
  for (const key of settings) {
    const value = withoutRowIds(doc[key])
    if (value !== undefined && value !== null && value !== '') props[key] = value
  }
  const rows = Array.isArray(doc.fields) ? doc.fields.filter(isPlainObject) : []
  const fields = rows.flatMap((row) => {
    const block = fieldBlockOf(row)
    return block ? [block] : []
  })
  return { props, children: [...fields, { id: createId(), type: FORM_SUBMIT_BLOCK }] }
}

/** A value without Payload's `id` keys in array rows (emails), except where a row needs it. */
function withoutRowIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((row) => (isPlainObject(row) ? Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => [k, withoutRowIds(v)])) : row))
  return value
}

/** A value with empty values (`null`, `undefined`, `''`, empty objects) and the ids of settings rows left out, for hashing. */
function canonical(value: unknown, keepIds: boolean): unknown {
  // Field rows keep their ids (they name the blocks); rows of settings lists (emails) do not.
  if (Array.isArray(value)) return value.map((item) => canonical(item, keepIds && isPlainObject(item) && 'blockType' in item))
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).toSorted()) {
    if (key === 'id' && !keepIds) continue
    const item = canonical(value[key], false)
    if (item === null || item === undefined || item === '') continue
    if (isPlainObject(item) && Object.keys(item).length === 0) continue
    out[key] = item
  }
  return out
}

/**
 * A short hash of the form data a Form block writes (`formDataFromBlock`), stored on the form as
 * `source.hash`. The next publish writes the form only when the hash differs, so Payload's own
 * defaults in the stored document (empty condition groups, a default redirect) never count as a
 * change. Keys are sorted and empty values left out; FNV-1a over the JSON.
 */
export function formDataHash(data: Record<string, unknown>): string {
  const text = JSON.stringify(canonical(data, true))
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(36)}-${text.length.toString(36)}`
}

/**
 * The data that clears the settings `stored` has and `next` lacks, so Payload removes them (an
 * update keeps keys it is not sent): `[]` for a list (emails), `null` for text and rich text.
 * Groups (redirect, spam protection) stay: Payload's field hooks expect a group value.
 */
export function clearedSettings(stored: Record<string, unknown>, next: Record<string, unknown>, settings: readonly string[]): Record<string, null | []> {
  const out: Record<string, null | []> = {}
  for (const key of settings) {
    if (key === 'title' || key in next) continue
    const value = stored[key]
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) out[key] = []
    } else if (!isPlainObject(value) || isRichText(value)) out[key] = null
  }
  return out
}

/** The source of a stored form, or null when it has none. */
export function formSourceOf(doc: Record<string, unknown>): FormSource | null {
  const source = doc[FORM_SOURCE_FIELD]
  if (!isPlainObject(source)) return null
  const { collection, document, block, hash } = source
  if (typeof collection !== 'string' || !collection || typeof document !== 'string' || !document || typeof block !== 'string' || !block) return null
  return { collection, document, block, ...(typeof hash === 'string' && hash ? { hash } : {}) }
}

/** True when a stored form was made from this block of this document. */
export function isFormOf(doc: Record<string, unknown>, source: FormSource): boolean {
  const own = formSourceOf(doc)
  return own !== null && own.collection === source.collection && own.document === source.document && own.block === source.block
}

/**
 * The layout with `props.form` of each Form block in `ids` (block id -> form id) set. Returns the
 * same layout when nothing changes.
 */
export function withFormIds(layout: Layout, ids: ReadonlyMap<string, string | number>): Layout {
  let changed = false
  const visit = (list: Block[]): Block[] =>
    list.map((block) => {
      let next = block
      const id = ids.get(block.id)
      if (block.type === FORM_BLOCK && id !== undefined && formIdOf(block.props?.form) !== id) {
        next = { ...block, props: { ...block.props, form: id } }
        changed = true
      }
      if (next.slots) {
        const slots = Object.fromEntries(Object.entries(next.slots).map(([name, children]) => [name, visit(children)]))
        if (Object.entries(slots).some(([name, children]) => children !== next.slots?.[name])) next = { ...next, slots }
      }
      return next
    })
  const blocks = visit(layout.blocks)
  return changed ? { ...layout, blocks } : layout
}

/** The children slot of a Form block. */
export const formChildren = (form: Block): Block[] => form.slots?.[FORM_SLOT] ?? []

/**
 * The layout with each "Use a saved form" Form block whose `form` is a loaded document holding
 * that form's fields as its children (then a Submit button), so the site renders a saved form with
 * the same field blocks as a form built on the page, and the page's CSS covers the fields' classes.
 * The site runs it after loading the layout's documents (`loadLayoutData`). Returns the same layout
 * when there is no such block.
 */
export function withSavedFormFields(layout: Layout): Layout {
  let changed = false
  const visit = (list: Block[]): Block[] =>
    list.map((block) => {
      if (block.type === FORM_BLOCK && formBlockMode(block.props) === 'saved' && isPlainObject(block.props?.form)) {
        const doc = block.props.form
        const rows = Array.isArray(doc.fields) ? doc.fields.filter(isPlainObject) : []
        const fields = rows.flatMap((row) => {
          const field = fieldBlockOf(row)
          return field ? [{ ...field, id: `${block.id}-${field.id}` }] : []
        })
        changed = true
        return { ...block, slots: { ...block.slots, [FORM_SLOT]: [...fields, { id: `${block.id}-submit`, type: FORM_SUBMIT_BLOCK }] } }
      }
      if (!block.slots) return block
      return { ...block, slots: Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, visit(children)])) }
    })
  const blocks = visit(layout.blocks)
  return changed ? { ...layout, blocks } : layout
}

/** The ids of the forms the "Use a saved form" Form blocks of `layouts` show, without repeats. */
export function savedFormIds(layouts: readonly Layout[]): Array<string | number> {
  const out = new Map<string, string | number>()
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.type === FORM_BLOCK && formBlockMode(block.props) === 'saved') {
        const id = formIdOf(block.props?.form)
        if (id !== null) out.set(String(id), id)
      }
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  for (const layout of layouts) visit(layout.blocks)
  return [...out.values()]
}

/** Every class of the fields of saved forms (their own classes and part classes), split on spaces. */
export function savedFormsClasses(docs: ReadonlyArray<Record<string, unknown>>): string[] {
  const out = new Set<string>()
  for (const doc of docs) {
    for (const row of Array.isArray(doc.fields) ? doc.fields : []) {
      const block = isPlainObject(row) ? fieldBlockOf(row) : null
      for (const value of [block?.className, ...Object.values(block?.partClassName ?? {})]) {
        for (const name of (value ?? '').split(/\s+/)) if (name) out.add(name)
      }
    }
  }
  return [...out]
}

/**
 * The look a Form block takes on when a saved form moves into it ("Move into this page"): the
 * Form block's default layout classes when its own classes lay out nothing (a block that was only
 * a box around the saved form), and the default classes of each part it has none for.
 */
export function movedFormLook(block: Block, def: BlockDefinition | undefined): { addClassName?: string; partClassName?: Record<string, string> } {
  const own = (block.className ?? '').split(/\s+/)
  const laysOut = own.some((name) => /^(flex|grid|inline-flex|inline-grid)$/.test(name))
  const parts = Object.fromEntries(
    Object.entries(def?.parts ?? {}).flatMap(([name, part]) => (part.defaultClassName && !block.partClassName?.[name] ? [[name, part.defaultClassName]] : [])),
  )
  return {
    ...(def?.defaultClassName && !laysOut ? { addClassName: def.defaultClassName } : {}),
    ...(Object.keys(parts).length > 0 ? { partClassName: parts } : {}),
  }
}
