// Texts and helpers shared by the MCP tools (src/mcp) and the editor's AI assistant (src/ai).
// No zod and no Payload runtime here, so the assistant does not need the MCP dependencies.

import { COLLECTION_LIST_BLOCK, FIELD_BLOCK, URL_PATH } from '../core/bindings'
import { dataFields, optionValues } from '../core/fields'
import { createId } from '../core/ids'
import { MOTION_EASING_INFO, MOTION_KINDS, MOTION_PRESET_INFO, MOTION_SPECS } from '../core/motion'
import { DEFAULT_SLOT, indexLayout } from '../core/tree'
import type { Block, BlockDefinition, Layout, Operation, SectionDefinition } from '../core/types'

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
LAYOUT MODEL. A layout is JSON: { "version": 1, "blocks": Block[] }. A Block is { id, type, props?, className?, slots?, bindings?, hidden?, motion? }.
- id: a string, unique in the whole layout. Operations target blocks by id, never by array index. New blocks need new ids: use "b_" plus 6 lowercase letters or digits (e.g. "b_k3x9qa").
- type: a block type from ${blocksFrom}.
- props: the block's own values. Get the exact shape with getBlockSchema. Upload and relationship props hold document IDs.
- className: Tailwind CSS v4 utility classes, with variants such as md:, lg:, hover:, dark:. Theme classes work (bg-primary, text-primary-foreground, text-muted-foreground, font-heading). CSS is generated on save, so any valid class works.
- slots: child blocks by slot name, e.g. { "children": [ ...blocks ] }. Only block types with slots take children. ${blocksFrom} shows which types each slot accepts. A type with "onlyInside" goes only directly inside those types (e.g. "listItem" only in a "list"). A slot with "maxBlocks" holds at most that many direct children: inserting into a full slot fails, so replace (update or remove) the block there instead. A slot with "minBlocks" needs that many before the page can be published.
- bindings: (templates and collection list items only) prop path -> document field path, e.g. { "text": "title" }, { "image": "featuredImage" }, { "link": "$url" }. At render time the prop takes the document's value; when the document has no value the literal prop stays. Get field paths from getBindingSources.
- motion: animations of the block (see MOTION below). Leave it out when the block has none.
- Canonical form: leave out empty props, slots, bindings and motion objects and empty slot lists. Set hidden only when true.
POSITION = { parentId, slot?, index }. parentId null means the page root, whose only slot is "children". slot defaults to "children". index is the block's FINAL index in the target list (0 = first; the list length = append). For a move inside the same list, count positions after the block is taken out.
${motionGuide()}`.trim()
}

export const BINDINGS_GUIDE = [
  'BINDINGS. A block in a template (or in a collection list item) binds props to document fields: "bindings": { "<prop path>": "<field path>" }.',
  'Examples: heading { "text": "title" }, text { "text": "excerpt" }, image { "image": "featuredImage" }, button or link { "link": "$url" }.',
  `"${URL_PATH}" is the document's page URL. Nested props use dots: { "link.url": "$url" }.`,
  'Values are converted to the prop type: rich text and dates become plain text in text props. When the document has no value, the literal prop stays, so bound props may stay empty.',
  `The "${FIELD_BLOCK}" block shows any field by its type (rich text, image, date, text): props { "path": "content" }.`,
  `In a "${COLLECTION_LIST_BLOCK}" block, blocks in the "item" slot bind to each LISTED document, not to the page.`,
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
  return section.blocks.map((block, i) => ({
    type: 'insert' as const,
    block: withNewIds(block, used),
    to: { parentId, slot, index: start + i },
  }))
}

/** A block type as plain data for AI models: props, slots, where it may go, description and example. */
export function describeBlock(def: BlockDefinition) {
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
    ...(def.ai?.example ? { example: def.ai.example } : {}),
  }
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
