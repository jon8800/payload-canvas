// Texts and helpers shared by the MCP tools (src/mcp) and the editor's AI assistant (src/ai).
// No zod and no Payload runtime here, so the assistant does not need the MCP dependencies.

import { COLLECTION_LIST_BLOCK, FIELD_BLOCK, INDEX_PATH, isRepeatSlot, ITEM_PATH, PAGE_PATH, PARENT_PATH, REPEAT_BLOCK, URL_PATH } from '../core/bindings'
import { blockParts } from '../core/classes'
import { conditionMet, readCondition } from '../core/conditions'
import { dataFields, optionValues } from '../core/fields'
import { htmlIdsOf, withoutTakenHtmlIds } from '../core/attrs'
import { createId } from '../core/ids'
import { MOTION_EASING_INFO, MOTION_KINDS, MOTION_PRESET_INFO, MOTION_SPECS } from '../core/motion'
import { listedVariants } from '../core/sections'
import { DEFAULT_SLOT, indexLayout } from '../core/tree'
import type { Block, BlockDefinition, Layout, Operation, SectionDefinition } from '../core/types'
import type { LayoutError } from '../core/validate'

/** The keys of a motion kind with their limits, e.g. "duration 50-5000, easing: ease-out | ..., repeat". */
function motionKeys(kind: (typeof MOTION_KINDS)[number]): string {
  const spec = MOTION_SPECS[kind]
  const numbers = Object.entries(spec.numbers).map(([key, range]) => `${key} ${range.min} to ${range.max}`)
  const words = Object.entries(spec.words ?? {}).map(([key, list]) => `${key} ${(list ?? []).join('|')}`)
  const booleans = (spec.booleans ?? []).map((key) => `${key} true|false`)
  return [...numbers, ...words, ...booleans].join(', ')
}

/**
 * How block animations ("motion") are written, for AI models. The preset lists come from
 * MOTION_PRESET_INFO, so they cannot drift from the editor and the checks.
 */
export function motionGuide(): string {
  const kinds = MOTION_KINDS.map((kind) => {
    const presets = MOTION_PRESET_INFO[kind].map((p) => `${p.value} (${p.description.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())})`).join('; ')
    return `  - ${kind}: ${presets}. Options: ${motionKeys(kind)}.`
  })
  return [
    'MOTION (animations). A block can have "motion": { enter?, hover?, press?, scroll?, loop? }. Each kind is { preset, ...options }. Times are milliseconds, distances pixels. Out-of-range values and unknown keys are errors.',
    ...kinds,
    `  - easing values: ${MOTION_EASING_INFO.map((e) => e.value).join(', ')}.`,
    '- enter plays when the block scrolls into view (trigger "view", the default) or when the page loads (trigger "load"). With enter.stagger, the direct child blocks play the entrance one after another and the block itself stays still.',
    '- Insert a block with "motion" to add it at once. In "update", `motion` merges per kind: each kind you send replaces that kind, null removes a kind, kinds you leave out stay, and motion: null removes all motion.',
    '- Example: "motion": { "enter": { "preset": "fade-up", "stagger": 80 } } on a grid of cards. Update: "motion": { "hover": { "preset": "lift" }, "press": { "preset": "shrink" } }. getBlockSchema has the full schema (properties.motion).',
  ].join('\n')
}

/**
 * The layout format, for AI models. `blocksFrom` names where the model finds the block types
 * (a tool name, or "the block catalog").
 */
export function layoutGuide(blocksFrom: string): string {
  return `
LAYOUT MODEL. A layout is JSON: { "version": 1, "blocks": Block[] }. A Block is { id, type, props?, className?, slots?, bindings?, visibility?, hidden?, motion?, attrs?, partClassName? }.
- id: a string, unique in the whole layout. Operations target blocks by id, never by array index. New blocks need new ids: use "b_" plus 6 lowercase letters or digits (e.g. "b_k3x9qa").
- type: a block type from ${blocksFrom}.
- props: the block's own values. Get the exact shape with getBlockSchema. Upload and relationship props hold document IDs.
- className: Tailwind CSS v4 utility classes, with variants such as md:, lg:, hover:, dark:. Theme classes work (bg-primary, text-primary-foreground, text-muted-foreground, font-heading). CSS is generated on save, so any valid class works. In "update", className replaces the whole list; addClassName and removeClassName (space-separated) change single classes and keep the rest.
- slots: child blocks by slot name, e.g. { "children": [ ...blocks ] }. Only block types with slots take children. ${blocksFrom} shows which types each slot accepts. A type with "onlyInside" goes only directly inside those types (e.g. "listItem" only in a "list"). A slot with "maxBlocks" holds at most that many direct children: inserting into a full slot fails, so replace (update or remove) the block there instead. A slot with "minBlocks" needs that many before the page can be published.
- bindings: (templates, and blocks inside the "item" slot of a collection list or repeat, only) prop path -> document field path, e.g. { "text": "title" }, { "image": "featuredImage" }, { "link": "$url" }. At render time the prop takes the document's value; when the document has no value the literal prop stays. Get field paths from getBindingSources.
- visibility: (templates, and blocks inside the "item" slot of a collection list or repeat, only) conditions that show the block only when they match the document (see VISIBILITY in the bindings guide). Leave it out when the block always shows.
- On a normal page, outside list and repeat items, there is no current document: bindings and visibility do nothing (the block always shows), and the tools return a "no-effect" warning. Use "hidden": true to hide a block there.
- motion: animations of the block (see MOTION below). Leave it out when the block has none.
- partClassName: Tailwind classes of a block's inner elements, by part name, e.g. { "empty": "col-span-full text-center" } on a collection list or { "arrow": "size-12 rounded-full bg-white" } on a carousel. Only the "parts" listed in ${blocksFrom} take them. In "update" it merges per part; null removes a part's classes.
- attrs: HTML attributes of the block element: { id?, ariaLabel?, ariaHidden? }. "id" is an anchor for "#id" links (e.g. "contact"), unique in the layout, letters, digits, - and _, starting with a letter; never the block id. "ariaLabel" names the element for screen readers (e.g. a nav or an icon-only link). "ariaHidden": true hides decorative blocks from screen readers. Copies of a section or a block leave out an id the page already uses.
- section: { id, variant? } on the root block of a ready-made section, set by insertSection. Editors use it to switch the section to another variant. Keep it as it is; never write it yourself.
- Canonical form: leave out empty props, slots, bindings, visibility and motion objects and empty slot lists. Set hidden only when true.
POSITION = { parentId, slot?, index }. parentId null means the page root, whose only slot is "children". slot defaults to "children". index is the block's FINAL index in the target list (0 = first; the list length = append). For a move inside the same list, count positions after the block is taken out.
${motionGuide()}`.trim()
}

export const BINDINGS_GUIDE = [
  'BINDINGS. A block in a template (or in a collection list item) binds props to document fields: "bindings": { "<prop path>": "<field path>" }.',
  'Examples: heading { "text": "title" }, text { "text": "excerpt" }, image { "image": "featuredImage" }, button or link { "link": "$url" }.',
  `"${URL_PATH}" is the document's page URL. Nested props use dots: { "link.url": "$url" }. "<relationship path>.${URL_PATH}" is the page URL of a related document, e.g. { "link": "categories.0.${URL_PATH}" } (the first category of a listed post).`,
  'Values are converted to the prop type: rich text and dates become plain text in text props. When the document has no value, the literal prop stays, so bound props may stay empty.',
  `The "${FIELD_BLOCK}" block shows any field by its type (rich text, image, date, text): props { "path": "content" }.`,
  `In a "${COLLECTION_LIST_BLOCK}" block, blocks in the "item" slot bind to each LISTED document, not to the page.`,
  `In a "${REPEAT_BLOCK}" block (props { "path": "faqs" }), blocks in the "item" slot bind to each ROW of that list field: the row's fields ("question"), "${ITEM_PATH}" (the row value, e.g. an upload for an image) and "${INDEX_PATH}" (the row number from 1).`,
  `Inside any list or repeat item: "${PARENT_PATH}.<field>" reads the enclosing document (e.g. "${PARENT_PATH}.name"), "${PAGE_PATH}.<field>" the page's own document, "${INDEX_PATH}" the item number.`,
  'Fallbacks: "subtitle|title" uses the first path with a value.',
  'Formatters after the paths, arguments after ":": "publishedAt|date:en-GB:Europe/London" (language, time zone), "price|currency:EUR" (€1,200; code, language), "price|number", "name|uppercase", "name|lowercase", "summary|truncate:160" (characters) or "summary|truncate:25:words". After the first part, a formatter name is always a formatter: a field called "date" can only be the first path.',
  'Template strings: a binding with {{…}} is text with expressions, e.g. { "text": "Read about {{title}}" } or "From {{price|currency:EUR}}". A missing expression becomes empty; when all are missing the literal prop stays. There is no other syntax.',
  'VISIBILITY. "visibility": { "match"?: "all" | "any", "conditions": [{ "field", "operator", "value"?, "valueField"?, "count"? }] } shows the block only when all (or any) conditions match the document. "valueField" (a field path) compares with another field instead of "value". With "match": "any", an entry may be a group { "all": [conditions] }, so { "match": "any", "conditions": [{ "all": [a, b] }, c] } means (a and b) or c. field: a field path, or "$index", "$item", "$parent.<field>", "$page.<field>". Operators: is_set, is_empty (no value; false counts as empty), equals, not_equals (for lists: any item or document id), in, not_in (value is a list), greater_than, greater_than_equal, less_than, less_than_equal (numbers or dates), like (all words, any case), contains (any case). "count": true compares the number of items of an array or hasMany field. Examples: { "conditions": [{ "field": "price", "operator": "greater_than", "value": 100 }] }; { "conditions": [{ "field": "gallery", "operator": "greater_than_equal", "value": 3, "count": true }] }. A block that fails renders nothing on the site. On a normal page, outside list and repeat items, there is no current document: the conditions are not checked and the block always shows.',
].join('\n')

/** Copies a block tree with new ids that are not in `used`. */
export function withNewIds(block: Block, used: Set<string>): Block {
  let id = createId()
  while (used.has(id)) id = createId()
  used.add(id)
  const copy: Block = { ...structuredClone(block), id }
  if (block.slots) {
    copy.slots = Object.fromEntries(
      Object.entries(block.slots).map(([name, children]) => [name, children.map((child) => withNewIds(child, used))]),
    )
  }
  return copy
}

/** Words models use for the page root. An id counts as the root when ALL its words are in this list. */
const ROOT_WORDS = new Set([
  'root', 'page', 'body', 'null', 'none', 'nil', 'undefined', 'document', 'doc', 'top', 'level', 'main', 'html',
  'layout', 'canvas', 'the', 'of', 'toplevel', 'pageroot', 'rootpage', 'documentroot',
])

/**
 * True for a parent id that means "the page root" although it is a string: models send "", "root",
 * "__PAGE_ROOT__", "<root>", "$root", "page-root", "body" and the like instead of null (strict tool
 * schemas make them fill every field).
 *
 * The id is split into words at every character that is not a letter or digit (and at camelCase
 * borders). It is the root when it has no words, or when every word is a root word. Generated block
 * ids ("b_k3x9qa") always hold the word "b" and a 6-character random word, so they never match.
 * `exists` guards a layout that really has a block with such an id: that block wins.
 */
export function isRootParentId(id: unknown, exists?: (id: string) => boolean): boolean {
  if (id === null || id === undefined) return true
  if (typeof id !== 'string') return false
  if (exists?.(id)) return false
  const words = id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return words.every((word) => ROOT_WORDS.has(word))
}

/**
 * Sets a root-like `to.parentId` ("__PAGE_ROOT__", "root", ...) of insert and move operations to
 * null. Returns the operations (copies only where something changed) and how many ids it fixed.
 * Operations that are not plain objects pass through: the operation checks report them.
 */
export function repairRootParents<T>(layout: Layout, ops: T[]): { ops: T[]; fixed: number } {
  const index = indexLayout(layout)
  let fixed = 0
  const out = ops.map((op) => {
    const value = op as { type?: unknown; to?: { parentId?: unknown } } | null
    const parentId = value?.to?.parentId
    if (!value || (value.type !== 'insert' && value.type !== 'move') || typeof parentId !== 'string') return op
    if (!isRootParentId(parentId, (id) => index.has(id))) return op
    fixed++
    return { ...value, to: { ...value.to, parentId: null } } as T
  })
  return { ops: out, fixed }
}

/** How to fix an unknown parent id. Models retry the same call when the error does not say. */
export function unknownParentMessage(id: string): string {
  return `Parent block "${id}" not found. Use parentId null for the page root, or a block id from getLayout.`
}

/** Operations that insert a section's blocks at a position. Ids are regenerated. */
export function sectionInsertOps(
  layout: Layout,
  section: SectionDefinition,
  at: { parentId?: string | null; slot?: string; index?: number },
): Operation[] | string {
  const index = indexLayout(layout)
  // Models often send "" or "root" for the page root (strict tool schemas make them fill every field).
  const parentId = isRootParentId(at.parentId, (id) => index.has(id)) ? null : (at.parentId as string)
  const slot = at.slot?.trim() ? at.slot : DEFAULT_SLOT
  if (parentId !== null && !index.has(parentId)) return unknownParentMessage(parentId)
  const list = parentId === null ? layout.blocks : (index.get(parentId)?.block.slots?.[slot] ?? [])
  const start = at.index ?? list.length
  if (start < 0 || start > list.length) return `Index ${start} is out of range (0-${list.length})`
  const used = new Set(index.keys())
  // A second copy of a section leaves out the HTML ids the page already uses.
  const taken = htmlIdsOf(layout.blocks)
  return section.blocks.map((block, i) => {
    const copy = withoutTakenHtmlIds(withNewIds(block, used), taken)
    htmlIdsOf([copy], taken)
    return { type: 'insert' as const, block: copy, to: { parentId, slot, index: start + i } }
  })
}

/** A block type as plain data for AI models: props, slots, where it may go, description and example. */
export function describeBlock(def: BlockDefinition) {
  // Inner elements that take classes in `partClassName`, with the classes a new block starts with.
  const parts = blockParts(def).map(({ name, label, defaultClassName }) => ({ name, label, ...(defaultClassName ? { defaultClassName } : {}) }))
  const props = dataFields(def.fields as unknown[]).map((f) => {
    const options = f.type === 'select' || f.type === 'radio' ? optionValues(f) : undefined
    return {
      name: f.name,
      type: f.type,
      ...(f.required ? { required: true } : {}),
      ...(f.hasMany ? { hasMany: true } : {}),
      ...(options?.length ? { options } : {}),
      ...(f.relationTo ? { relationTo: f.relationTo } : {}),
    }
  })
  const slots = def.slots
    ? Object.fromEntries(
        Object.entries(def.slots).map(([name, slot]) => [
          name,
          {
            ...(slot.label ? { label: slot.label } : {}),
            accepts: slot.allow && !slot.allow.includes('*') ? slot.allow : 'any block',
            ...(typeof slot.min === 'number' ? { minBlocks: slot.min } : {}),
            ...(typeof slot.max === 'number' ? { maxBlocks: slot.max } : {}),
          },
        ]),
      )
    : undefined
  return {
    type: def.type,
    label: def.label,
    ...(def.category ? { category: def.category } : {}),
    ...(def.ai?.description ? { description: def.ai.description } : {}),
    props,
    ...(slots ? { slots } : { slots: 'none (cannot have children)' }),
    ...(def.parents ? { onlyInside: def.parents } : {}),
    ...(def.styles === false ? { className: 'not supported' } : {}),
    ...(def.defaultClassName ? { defaultClassName: def.defaultClassName } : {}),
    ...(parts.length > 0 ? { parts } : {}),
    ...(def.ai?.example ? { example: def.ai.example } : {}),
  }
}

/**
 * `variants` of a `listSections` entry (MCP and the assistant): each variant's id, label,
 * description and outline (`full`: its block JSON). Empty when the section has none.
 */
export function variantsListing(section: SectionDefinition, full: boolean): { variants?: Record<string, unknown>[] } {
  const variants = listedVariants(section, (blocks) => (full ? { blocks } : { outline: outline(blocks).join('\n') }))
  return variants ? { variants } : {}
}

/** One line per block (indented by depth), with the start of its text, for a short section summary. */
export function outline(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((block) => {
    const label = typeof block.props?.text === 'string' ? ` "${String(block.props.text).slice(0, 40)}"` : ''
    const own = `${'  '.repeat(depth)}${block.type}${label}`
    const children = Object.values(block.slots ?? {}).flatMap((list) => outline(list, depth + 1))
    return [own, ...children]
  })
}

// ---------------------------------------------------------------------------
// Tool results: what changed, what still needs content, keys that do nothing
// ---------------------------------------------------------------------------

/** One operation of a batch, for tool results. */
export type ChangeSummary = {
  op: Operation['type']
  id: string
  type: string
  /** insert and move: where the block went. */
  to?: { parentId: string | null; slot?: string; index: number }
  /** insert: how many blocks the inserted subtree holds, when more than one. */
  blocks?: number
  /** update: what changed ("props.text", "className", "visibility", ...). */
  changed?: string[]
  /** update with class changes: the block's class list after the batch ("" when it has none). */
  className?: string
}

const UPDATE_META = new Set(['type', 'id', 'locale'])
const CLASS_KEYS = new Set(['className', 'addClassName', 'removeClassName'])

/**
 * A short list of what an operation batch did, one entry per operation: ids, block types, and for
 * updates the keys they changed. `before` and `after` are the layouts around the batch, `ops` the
 * applied operations (duplicates as inserts).
 */
export function changeSummary(before: Layout, after: Layout, ops: readonly Operation[]): ChangeSummary[] {
  const old = indexLayout(before)
  const now = indexLayout(after)
  const typeOf = (id: string) => now.get(id)?.block.type ?? old.get(id)?.block.type ?? 'unknown'
  return ops.map((op): ChangeSummary => {
    switch (op.type) {
      case 'insert': {
        const count = touchedIds([op]).size
        return { op: op.type, id: op.block.id, type: op.block.type, to: op.to, ...(count > 1 ? { blocks: count } : {}) }
      }
      case 'move':
        return { op: op.type, id: op.id, type: typeOf(op.id), to: op.to }
      case 'remove':
      case 'duplicate':
        return { op: op.type, id: op.id, type: typeOf(op.id) }
      case 'update': {
        const changed: string[] = []
        for (const [key, value] of Object.entries(op)) {
          if (UPDATE_META.has(key) || value === undefined) continue
          if (key === 'props' && value && typeof value === 'object') changed.push(...Object.keys(value).map((name) => `props.${name}`))
          else if (key === 'unsetProps' && Array.isArray(value)) changed.push(...value.map((name) => `props.${String(name)}`))
          else if (CLASS_KEYS.has(key)) changed.push('className')
          else changed.push(key)
        }
        const classes = Object.keys(op).some((key) => CLASS_KEYS.has(key))
        return {
          op: op.type,
          id: op.id,
          type: typeOf(op.id),
          changed: [...new Set(changed)],
          ...(classes ? { className: now.get(op.id)?.block.className ?? '' } : {}),
        }
      }
    }
  })
}

/** The block ids an operation batch touched: inserted blocks with their children, moved and updated blocks. */
export function touchedIds(ops: readonly Operation[]): Set<string> {
  const ids = new Set<string>()
  const collect = (block: Block) => {
    ids.add(block.id)
    for (const children of Object.values(block.slots ?? {})) children.forEach(collect)
  }
  for (const op of ops) {
    if (op.type === 'insert') collect(op.block)
    else if (op.type === 'move' || op.type === 'update') ids.add(op.id)
  }
  return ids
}

/** A block prop that is still empty and needs an upload or a document. */
export type MissingContent = { id: string; type: string; prop: string; field: 'upload' | 'relationship'; relationTo: string | string[] }

/**
 * Blocks in `list` (children included) whose main upload or relationship prop is empty: an image
 * block without an image, a form block without a form. Per block type that is the first upload or
 * relationship field and every required one. Props hidden by their field's condition, bound props
 * and hasMany fields are left out.
 */
export function missingContent(list: readonly Block[], definitions: readonly BlockDefinition[]): MissingContent[] {
  const byType = new Map(definitions.map((def) => [def.type, def]))
  const out: MissingContent[] = []
  const visit = (block: Block) => {
    const def = byType.get(block.type)
    if (def) {
      const fields = dataFields(def.fields as unknown[])
      const props = block.props ?? {}
      const refs = fields.filter((f) => (f.type === 'upload' || f.type === 'relationship') && !f.hasMany && f.relationTo)
      refs.forEach((field, i) => {
        if (i > 0 && !field.required) return
        const value = props[field.name]
        if ((value !== undefined && value !== null && value !== '') || block.bindings?.[field.name]) return
        const condition = readCondition(field)
        if (condition && !conditionMet(condition, props, fields)) return
        out.push({ id: block.id, type: block.type, prop: field.name, field: field.type as MissingContent['field'], relationTo: field.relationTo as string | string[] })
      })
    }
    for (const children of Object.values(block.slots ?? {})) children.forEach(visit)
  }
  list.forEach(visit)
  return out
}

/** What to do about `missingContent`, for tool results. `generateImage`: the tool that makes images is there. */
export function missingContentHint(missing: readonly MissingContent[], options: { generateImage: boolean }): string {
  const parts: string[] = []
  if (missing.some((m) => m.field === 'upload')) {
    parts.push(
      `Empty images render nothing on the site. ${options.generateImage ? 'Make one with generateImage, or use' : 'Use'} an existing upload (findDocument or searchContent on the upload collection) or upload one (uploadMedia), then set its id: applyOperations {"type":"update","id":"<block id>","props":{"<prop>":<media id>}}.`,
    )
  }
  if (missing.some((m) => m.field === 'relationship')) {
    parts.push('Empty relationships (for example a form): find a document of `relationTo` with findDocument, then set its id the same way.')
  }
  return parts.join(' ')
}

/**
 * Warnings for `visibility` and `bindings` that do nothing: on a normal page nothing checks them
 * (there is no current document), so the block always shows and bound props keep their own value.
 * They work in templates and inside the "item" slot of a collection list or repeat. `only`: report
 * these block ids only.
 */
export function contextOnlyWarnings(layout: Layout, only?: ReadonlySet<string>): LayoutError[] {
  const out: LayoutError[] = []
  const visit = (list: readonly Block[], path: string, inItem: boolean) => {
    list.forEach((block, i) => {
      const at = `${path}[${i}]`
      if (!inItem && (!only || only.has(block.id))) {
        if (block.visibility) out.push({ blockId: block.id, path: `${at}.visibility`, code: 'no-effect', message: CONTEXT_ONLY_VISIBILITY })
        if (block.bindings && Object.keys(block.bindings).length > 0) {
          out.push({ blockId: block.id, path: `${at}.bindings`, code: 'no-effect', message: CONTEXT_ONLY_BINDINGS })
        }
      }
      for (const [slot, children] of Object.entries(block.slots ?? {})) visit(children, `${at}.slots.${slot}`, inItem || isRepeatSlot(block.type, slot))
    })
  }
  visit(layout.blocks, 'blocks', false)
  return out
}

export const CONTEXT_ONLY_VISIBILITY =
  'visibility does nothing here: it only applies in templates and in collection list or repeat items. On a normal page the block always shows. Remove it, or set "hidden": true to hide the block.'
export const CONTEXT_ONLY_BINDINGS =
  'bindings do nothing here: they only apply in templates and in collection list or repeat items. On a normal page the props keep their own values. Write the values into props instead.'
