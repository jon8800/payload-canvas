// Tools of the editor's AI assistant. They work on an IN-MEMORY copy of the layout the user has
// open (the request's layout), never on the database: the editor applies the resulting operations
// and saves as usual. Inputs are validated here, because eager input streaming skips the API's
// own validation.

import { isRichText, richTextToPlain, withoutBoundRequired } from '../core/bindings'
import { createId } from '../core/ids'
import { blockJsonSchema } from '../core/schema'
import { indexLayout, isPlainObject, subtreeIds } from '../core/tree'
import { resolveLayoutLocale, stampLocale, untranslatedKeys } from '../core/locale'
import type { BindingField, Block, BlockDefinition, Layout, LocaleSettings, Operation, SectionDefinition } from '../core/types'
import type { AiToolDefinition } from './types'
import { validateLayout, type LayoutError } from '../core/validate'
import { resolveOperations, splitLayoutErrors } from '../live/apply'
import { sectionInsertOps } from '../mcp/shared'
import { findSection } from '../plugin/sections'

/** One image (or file) of the media library, as the assistant sees it. */
export type MediaItem = {
  id: string | number
  alt: string | null
  filename: string | null
  url: string | null
  width: number | null
  height: number | null
}

export type ToolEnv = {
  blocks: BlockDefinition[]
  /** The app's sections. Per request, the saved sections the user can read follow them. */
  sections: SectionDefinition[]
  /**
   * Saved sections are on: the section tools exist even without built-in sections, and their
   * schemas take any section id or name (the saved ones differ per request). Default false.
   */
  savedSections?: boolean
  /** Bindable fields per collection. Null when the site has no templates: no getBindingSources tool. */
  bindingSources: Record<string, BindingField[]> | null
  /** Searches the media collection as the request's user. */
  searchMedia: (query: string, limit: number) => Promise<MediaItem[]>
}

/** Result of one tool call. `ops` is set when the call changed the layout. */
export type ToolOutcome = {
  ok: boolean
  /** Tool result content for the model (JSON text). */
  content: string
  /** Short human summary for the editor, e.g. "Inserted Hero section". */
  summary: string
  ops?: Operation[]
}

// ---------------------------------------------------------------------------
// Working copy
// ---------------------------------------------------------------------------

function errorKey(error: LayoutError): string {
  return `${error.blockId ?? ''}|${error.code}|${error.message}`
}

/**
 * The layout the assistant edits during one request. Changes are all or nothing per call: a call
 * whose result adds a blocking validation error is rolled back. Errors that were already in the
 * user's layout do not block.
 */
export class Workspace {
  /** The stored layout (every locale). */
  layout: Layout
  readonly #blocks: BlockDefinition[]
  readonly #baseline: Set<string>
  readonly #localization: LocaleSettings | null
  /** The locale the assistant reads and writes. Null without localization. */
  readonly locale: string | null

  constructor(layout: Layout, blocks: BlockDefinition[], options: { localization?: LocaleSettings | null; locale?: string | null } = {}) {
    this.layout = layout
    this.#blocks = blocks
    this.#localization = options.localization ?? null
    this.locale = this.#localization ? (options.locale ?? this.#localization.defaultLocale) : null
    this.#baseline = new Set(this.#errors(layout).blocking.map(errorKey))
  }

  /** The layout as the assistant sees it: the locale's values with fallback (the stored layout without localization). */
  get view(): Layout {
    return this.#localization && this.locale ? resolveLayoutLocale(this.layout, this.#blocks, this.#localization, this.locale) : this.layout
  }

  /** How many props show the fallback language in the workspace's locale. */
  untranslatedCount(): number {
    const settings = this.#localization
    if (!settings || !this.locale || this.locale === settings.defaultLocale) return 0
    let count = 0
    for (const entry of indexLayout(this.layout).values()) count += untranslatedKeys(entry.block, this.#blocks, settings, this.locale).length
    return count
  }

  #errors(layout: Layout) {
    return splitLayoutErrors(withoutBoundRequired(validateLayout(layout, this.#blocks, { localization: this.#localization }), layout))
  }

  /**
   * Applies operations. Returns the applied operations (duplicates as inserts) and warnings. Prop
   * updates write the workspace's locale (localized props only), and so do inserted blocks (new
   * content), unless `copies` (a section keeps its own locale data).
   */
  apply(
    ops: unknown[],
    options: { copies?: boolean } = {},
  ): { ok: true; ops: Operation[]; warnings: LayoutError[] } | { ok: false; error: string; errors?: LayoutError[] } {
    const prepared = stampLocale(prepareOps(ops, this.layout) as Operation[], this.locale, this.#localization, { inserts: !options.copies })
    const resolved = resolveOperations(this.layout, prepared, this.#blocks, this.#localization)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const { blocking, warnings } = this.#errors(resolved.layout)
    const added = blocking.filter((e) => !this.#baseline.has(errorKey(e)))
    if (added.length > 0) {
      return { ok: false, error: 'The result would be an invalid layout. Nothing was changed.', errors: added.slice(0, 20) }
    }
    const changed = changedIds(resolved.ops)
    this.layout = resolved.layout
    return { ok: true, ops: resolved.ops, warnings: warnings.filter((w) => w.blockId && changed.has(w.blockId)).slice(0, 20) }
  }
}

/** Fills in ids the model left out: new blocks (and their children) and duplicate copies. */
function prepareOps(ops: unknown[], layout: Layout): unknown[] {
  const used = new Set(indexLayout(layout).keys())
  const fresh = () => {
    let id = createId()
    while (used.has(id)) id = createId()
    used.add(id)
    return id
  }
  const withIds = (value: unknown): unknown => {
    if (!isPlainObject(value)) return value
    const block: Record<string, unknown> = { ...value }
    if (typeof block.id !== 'string' || block.id === '') block.id = fresh()
    else used.add(block.id)
    if (isPlainObject(block.slots)) {
      block.slots = Object.fromEntries(
        Object.entries(block.slots).map(([name, list]) => [name, Array.isArray(list) ? list.map(withIds) : list]),
      )
    }
    return block
  }
  return ops.map((op) => {
    if (!isPlainObject(op)) return op
    if (op.type === 'insert') return { ...op, block: withIds(op.block) }
    if (op.type === 'duplicate' && (typeof op.newId !== 'string' || op.newId === '')) return { ...op, newId: fresh() }
    return op
  })
}

function changedIds(ops: Operation[]): Set<string> {
  const changed = new Set<string>()
  for (const op of ops) {
    if (op.type === 'insert') subtreeIds(op.block).forEach((id) => changed.add(id))
    else if (op.type === 'move' || op.type === 'update') changed.add(op.id)
  }
  return changed
}

const plural = (n: number) => `${n} block${n === 1 ? '' : 's'}`

/** "Added 2 blocks, updated 1 block" for the editor. */
export function describeOps(ops: Operation[]): string {
  const count = { insert: 0, update: 0, move: 0, remove: 0 }
  for (const op of ops) if (op.type in count) count[op.type as keyof typeof count]++
  const parts = [
    count.insert ? `added ${plural(count.insert)}` : '',
    count.update ? `updated ${plural(count.update)}` : '',
    count.move ? `moved ${plural(count.move)}` : '',
    count.remove ? `removed ${plural(count.remove)}` : '',
  ].filter(Boolean)
  const text = parts.join(', ') || 'no changes'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

const POSITION_SCHEMA = {
  type: 'object',
  description: 'Where the block goes. index is the FINAL index in the target list; the list length appends.',
  properties: {
    parentId: { type: ['string', 'null'], description: 'Parent block id, or null for the page root.' },
    slot: { type: 'string', description: 'Slot of the parent. Default "children".' },
    index: { type: 'integer', minimum: 0 },
  },
  required: ['parentId', 'index'],
} as const

const BLOCK_SCHEMA = {
  type: 'object',
  description:
    'A block: { id?, type, props?, className?, slots?, bindings?, hidden?, label? }. Children in slots have the same shape. `label` names the block for editors (e.g. "Hero"); give each top-level section one. Ids you leave out are generated; the tool result lists them.',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    props: { type: 'object' },
    className: { type: 'string' },
    slots: { type: 'object', description: 'Slot name -> array of child blocks.' },
    bindings: { type: 'object' },
    hidden: { type: 'boolean' },
    label: { type: 'string', description: 'Name for editors (outline). Never rendered.' },
  },
  required: ['type'],
} as const

/**
 * applyOperations as one flat operation object instead of a union (AiToolDefinition.simpleInputSchema).
 * Smaller models (and Gemini schema converters) handle it better. The tool validates and repairs
 * the input either way.
 */
const FLAT_OPERATIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      description: 'One or more operations, applied in order.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['insert', 'move', 'remove', 'duplicate', 'update'] },
          id: { type: 'string', description: 'The block to move, remove, duplicate or update.' },
          block: { type: 'object', description: 'insert only: the new block { type, props?, className?, slots? }.' },
          to: {
            type: 'object',
            description: 'insert and move: { parentId, slot?, index }. parentId null means the page root.',
            properties: { parentId: { type: 'string' }, slot: { type: 'string' }, index: { type: 'integer' } },
          },
          props: { type: 'object', description: 'update: props to merge.' },
          unsetProps: { type: 'array', items: { type: 'string' } },
          className: { type: 'string', description: 'update: the FULL class list (replaces all classes).' },
          hidden: { type: 'boolean' },
          bindings: { type: 'object' },
          label: { type: ['string', 'null'], description: 'update: name for editors (outline). null removes it.' },
          newId: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['operations'],
}

/** Tool definitions in a fixed order (the order is part of the cached prompt prefix). */
export function toolDefinitions(env: ToolEnv): AiToolDefinition[] {
  const types = env.blocks.map((b) => b.type)
  const saved = env.savedSections === true
  const sectionIds = env.sections.map((s) => s.id)
  // With saved sections the ids and categories differ per request: no enums (the tools check the input).
  const categories = saved ? [] : [...new Set(env.sections.map((s) => s.category).filter((c): c is string => Boolean(c)))]
  const tools: AiToolDefinition[] = [
    {
      name: 'getLayout',
      description:
        'Returns the current layout of the open page, including your changes so far in this reply. Call it when you need block ids or classes after several changes; the <editor_context> block already has the layout as it was when the user wrote.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    },
    {
      name: 'getBlockSchema',
      description:
        'Returns the JSON Schema of one block type: its props (with exact value shapes, e.g. links and rich text), className and slots. Call it before you write props whose shape the block catalog does not show.',
      inputSchema: {
        type: 'object',
        properties: { type: { type: 'string', enum: types, description: 'Block type.' } },
        required: ['type'],
        additionalProperties: false,
      },
      strict: true,
    },
  ]
  if (env.sections.length > 0 || saved) {
    tools.push(
      {
        name: 'listSections',
        description:
          'Lists the ready-made sections. The system prompt already has their outlines; call this with full: true when you need the exact block JSON of sections before inserting or copying from them.' +
          (saved ? ' The list also has the sections people saved on this site (saved: true, id "saved:<id>").' : ''),
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', ...(categories.length > 0 ? { enum: categories } : {}), description: 'Only this category.' },
            full: { type: 'boolean', description: 'Include the full block JSON. Default false.' },
          },
          additionalProperties: false,
        },
        strict: true,
      },
      {
        name: 'insertSection',
        description:
          'Inserts a ready-made or saved section into the open page. Use it to add whole page parts (hero, features, pricing, call to action, footer …). All ids are new; the result returns the inserted blocks with their ids, so you can adjust their text and classes with applyOperations "update" right away. Default position: the end of the page.',
        inputSchema: {
          type: 'object',
          properties: {
            sectionId: saved
              ? { type: 'string', description: 'A section catalog id, a saved section id ("saved:<id>") or a section name.' }
              : { type: 'string', enum: sectionIds, description: 'Section id from the section catalog.' },
            parentId: { type: 'string', description: 'Parent block id. Leave out for the page root.' },
            slot: { type: 'string', description: 'Slot of the parent. Default "children".' },
            index: { type: 'integer', description: 'Final index in the target list. Leave out to append.' },
          },
          required: ['sectionId'],
          additionalProperties: false,
        },
        strict: true,
      },
    )
  }
  tools.push(
    {
      // Not strict: blocks nest (recursive) and props are free-form, which strict schemas cannot
      // express. The tool validates every operation and the resulting layout instead.
      name: 'applyOperations',
      description: [
        'Edits the open page with a list of operations, applied in order, all or nothing. Use it for every change other than inserting a whole section.',
        'Operations:',
        '- insert { block, to }: add a block (with children) at a position.',
        '- move { id, to }: move a block (with children).',
        '- remove { id }: delete a block and its children.',
        '- duplicate { id, newId? }: copy a block right after itself.',
        '- update { id, props?, unsetProps?, className?, hidden?, bindings?, label? }: props and bindings are merged (shallow); className REPLACES all classes, so send the full list; null removes it; a null binding removes that binding; label renames the block for editors (null removes it).',
        'Position: { parentId (null = page root), slot? (default "children"), index (final index in the target list) }.',
        'On success the result lists the changed ids and any warnings (e.g. a required prop is empty). On error nothing changes and the error names the failing operation; fix it and call again.',
        'Example (ids come from the layout; block types and props from the block catalog): change a heading, then add a text block after it in the same section:',
        '{"operations":[{"type":"update","id":"b_head01","props":{"text":"Simple pricing"},"className":"text-4xl font-bold"},{"type":"insert","block":{"type":"text","props":{"text":"Pick a plan."}},"to":{"parentId":"b_sect01","slot":"children","index":1}}]}',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            minItems: 1,
            items: {
              anyOf: [
                { type: 'object', properties: { type: { const: 'insert' }, block: BLOCK_SCHEMA, to: POSITION_SCHEMA }, required: ['type', 'block', 'to'] },
                { type: 'object', properties: { type: { const: 'move' }, id: { type: 'string' }, to: POSITION_SCHEMA }, required: ['type', 'id', 'to'] },
                { type: 'object', properties: { type: { const: 'remove' }, id: { type: 'string' } }, required: ['type', 'id'] },
                { type: 'object', properties: { type: { const: 'duplicate' }, id: { type: 'string' }, newId: { type: 'string' } }, required: ['type', 'id'] },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'update' },
                    id: { type: 'string' },
                    props: { type: 'object', description: 'Merged into the existing props.' },
                    unsetProps: { type: 'array', items: { type: 'string' } },
                    className: { type: ['string', 'null'], description: 'Replaces ALL classes.' },
                    hidden: { type: 'boolean' },
                    bindings: { type: 'object', description: 'Prop path -> document field path; null removes.' },
                    label: { type: ['string', 'null'], description: 'Name for editors. null removes it.' },
                  },
                  required: ['type', 'id'],
                },
              ],
            },
          },
        },
        required: ['operations'],
      },
      simpleInputSchema: FLAT_OPERATIONS_SCHEMA,
    },
    {
      name: 'findBlocks',
      description:
        'Finds blocks in the open page by type and/or text (case-insensitive, searches text props). Use it to locate "the pricing heading" or "all buttons" in a long page. Returns ids, types, positions and the start of the text.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: types, description: 'Only blocks of this type.' },
          text: { type: 'string', description: 'Text the block contains.' },
        },
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: 'searchMedia',
      description:
        'Searches the media library for images by alt text or file name. Call it before you set an image or upload prop; use the returned id as the prop value. An empty query returns the newest images.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words from the alt text or file name, e.g. "team" or "office".' },
          limit: { type: 'integer', description: 'Maximum results, 1-20. Default 10.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      strict: true,
    },
  )
  const sourceSlugs = Object.keys(env.bindingSources ?? {})
  if (sourceSlugs.length > 0) {
    tools.push({
      name: 'getBindingSources',
      description:
        'Lists the fields of a collection that block props can bind to (dot paths such as "title", "featuredImage", "author.name"). Call it before you add bindings in a template or a collection list item.',
      inputSchema: {
        type: 'object',
        properties: { collection: { type: 'string', enum: sourceSlugs } },
        required: ['collection'],
        additionalProperties: false,
      },
      strict: true,
    })
  }
  return tools
}

/** Running summaries, shown while the tool input streams in. */
export const RUNNING_SUMMARY: Record<string, string> = {
  getLayout: 'Reading the page',
  getBlockSchema: 'Reading a block schema',
  listSections: 'Looking at sections',
  insertSection: 'Inserting a section',
  applyOperations: 'Editing the page',
  findBlocks: 'Finding blocks',
  searchMedia: 'Searching the media library',
  getBindingSources: 'Reading document fields',
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function ok(value: unknown, summary: string, ops?: Operation[]): ToolOutcome {
  return { ok: true, content: JSON.stringify(value), summary, ...(ops ? { ops } : {}) }
}

function fail(error: string, summary: string, details?: unknown): ToolOutcome {
  return { ok: false, content: JSON.stringify(details === undefined ? { error } : { error, details }), summary: `${summary}: ${error}` }
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined | Error {
  const value = input[key]
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : new Error(`"${key}" must be a string`)
}

/** Plain text of a block's props, for search and summaries. */
function blockText(block: Block): string {
  const parts: string[] = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 4) return
    if (typeof value === 'string') parts.push(value)
    else if (isRichText(value)) parts.push(richTextToPlain(value))
    else if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1))
    else if (isPlainObject(value)) Object.values(value).forEach((item) => visit(item, depth + 1))
  }
  visit(block.props ?? {}, 0)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const OP_TYPES = new Set(['insert', 'move', 'remove', 'duplicate', 'update'])
const ROOT_IDS = new Set(['', 'root', 'null', 'page'])

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Fixes the mistakes smaller models make in applyOperations input, and lists what it fixed so the
 * model learns: operations sent as a JSON string or as one object, "op" or "action" instead of
 * "type", position fields next to "to", a root parentId of "root" or "", a block sent as a JSON
 * string, a class list sent as an array. Returns an error message when there is no operation list.
 */
export function repairOperations(input: Record<string, unknown>): { ops: unknown[]; notes: string[] } | string {
  const notes: string[] = []
  let list: unknown = input.operations ?? input.ops ?? input.operation
  if (list === undefined && typeof input.type === 'string') {
    list = [input]
    notes.push('Wrap operations in { "operations": [ ... ] }.')
  }
  if (typeof list === 'string') {
    list = parseJson(list)
    if (typeof list !== 'string') notes.push('"operations" was a JSON string. Send a JSON array, not a string.')
  }
  if (isPlainObject(list)) {
    list = [list]
    notes.push('"operations" was one object. Send an array of operations.')
  }
  if (!Array.isArray(list) || list.length === 0) {
    return '"operations" must be a non-empty array, e.g. {"operations":[{"type":"update","id":"b_abc123","props":{"text":"Hi"}}]}'
  }
  const ops = list.map((raw, i) => {
    const value = parseJson(raw)
    if (!isPlainObject(value)) return value
    const op: Record<string, unknown> = { ...value }
    const fix = (note: string) => notes.push(`Operation ${i}: ${note}`)
    const alias = op.op ?? op.action
    if (typeof op.type !== 'string' && typeof alias === 'string') {
      op.type = alias
      delete op.op
      delete op.action
      fix('use "type" for the operation name.')
    }
    if (typeof op.type === 'string' && !OP_TYPES.has(op.type) && OP_TYPES.has(op.type.toLowerCase())) op.type = op.type.toLowerCase()
    if (op.type === 'insert' || op.type === 'move') {
      if (op.to === undefined && ('parentId' in op || 'index' in op)) {
        op.to = { parentId: op.parentId ?? null, ...(op.slot === undefined ? {} : { slot: op.slot }), index: op.index }
        delete op.parentId
        delete op.slot
        delete op.index
        fix('put parentId, slot and index inside "to".')
      }
      const to = parseJson(op.to)
      if (isPlainObject(to)) {
        const position: Record<string, unknown> = { ...to }
        const parent = position.parentId
        if (parent === undefined || (typeof parent === 'string' && ROOT_IDS.has(parent.toLowerCase()))) {
          if (parent !== undefined) fix('use parentId null for the page root.')
          position.parentId = null
        }
        if (typeof position.index === 'string' && /^\d+$/.test(position.index)) position.index = Number(position.index)
        op.to = position
      }
    }
    if (op.type === 'insert' && typeof op.block === 'string') {
      op.block = parseJson(op.block)
      fix('"block" was a JSON string. Send an object.')
    }
    if (op.type === 'update') {
      if (Array.isArray(op.className)) {
        op.className = op.className.filter((c) => typeof c === 'string').join(' ')
        fix('"className" is one string of classes separated by spaces.')
      }
      if (typeof op.props === 'string') op.props = parseJson(op.props)
    }
    return op
  })
  return { ops, notes }
}

export async function runTool(name: string, rawInput: unknown, workspace: Workspace, env: ToolEnv): Promise<ToolOutcome> {
  const input = isPlainObject(rawInput) ? rawInput : null
  if (!input) return fail('The input must be a JSON object', 'Invalid input', { received: rawInput })

  switch (name) {
    case 'getLayout':
      return ok({ layout: workspace.view }, 'Read the page')

    case 'getBlockSchema': {
      const def = env.blocks.find((b) => b.type === input.type)
      if (!def) return fail(`Unknown block type "${String(input.type)}"`, 'Block schema', { known: env.blocks.map((b) => b.type) })
      return ok(blockJsonSchema(def, env.blocks), `Read the ${def.label} schema`)
    }

    case 'listSections': {
      const category = optionalString(input, 'category')
      if (category instanceof Error) return fail(category.message, 'Sections')
      const list = env.sections.filter((s) => !category || s.category === category)
      return ok(
        list.map((s) => ({
          id: s.id,
          label: s.label,
          ...(s.savedId !== undefined ? { saved: true } : {}),
          ...(s.category ? { category: s.category } : {}),
          ...(input.full === true ? { blocks: s.blocks } : {}),
        })),
        `Looked at ${list.length} section${list.length === 1 ? '' : 's'}`,
      )
    }

    case 'insertSection': {
      const section = typeof input.sectionId === 'string' ? findSection(env.sections, input.sectionId) : undefined
      if (!section) {
        const known = env.sections.map((s) => (s.savedId !== undefined ? `${s.id} (${s.label})` : s.id))
        return fail(`Unknown section "${String(input.sectionId)}"`, 'Section not inserted', { known })
      }
      const parentId = optionalString(input, 'parentId')
      const slot = optionalString(input, 'slot')
      if (parentId instanceof Error || slot instanceof Error) return fail('parentId and slot must be strings', 'Section not inserted')
      if (input.index !== undefined && input.index !== null && !Number.isInteger(input.index)) {
        return fail('index must be an integer', 'Section not inserted')
      }
      const ops = sectionInsertOps(workspace.layout, section, {
        parentId: parentId ?? null,
        slot,
        index: typeof input.index === 'number' ? input.index : undefined,
      })
      if (typeof ops === 'string') return fail(ops, `Could not insert ${section.label}`)
      const result = workspace.apply(ops, { copies: true })
      if (!result.ok) return fail(result.error, `Could not insert ${section.label}`, result.errors)
      const inserted = result.ops.flatMap((op) => (op.type === 'insert' ? [op.block] : []))
      return ok(
        { ok: true, section: section.id, inserted, ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}) },
        `Inserted ${section.label}`,
        result.ops,
      )
    }

    case 'applyOperations': {
      const repaired = repairOperations(input)
      if (typeof repaired === 'string') return fail(repaired, 'Edit failed')
      const notes = repaired.notes.length > 0 ? { repaired: repaired.notes } : {}
      const result = workspace.apply(repaired.ops)
      if (!result.ok) return fail(result.error, 'Edit failed', result.errors ?? (repaired.notes.length > 0 ? notes : undefined))
      return ok(
        {
          ok: true,
          applied: result.ops.length,
          changedIds: [...changedIds(result.ops)],
          // Generated ids, so the model can target new blocks right away.
          inserted: result.ops.flatMap((op) => (op.type === 'insert' ? [{ id: op.block.id, type: op.block.type, to: op.to }] : [])),
          ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
          ...notes,
        },
        describeOps(result.ops),
        result.ops,
      )
    }

    case 'findBlocks': {
      const type = optionalString(input, 'type')
      const query = optionalString(input, 'text')
      if (type instanceof Error || query instanceof Error) return fail('type and text must be strings', 'Find failed')
      const needle = query?.trim().toLowerCase() ?? ''
      const matches: unknown[] = []
      for (const entry of indexLayout(workspace.view).values()) {
        if (type && entry.block.type !== type) continue
        const text = blockText(entry.block)
        if (needle && !text.toLowerCase().includes(needle)) continue
        matches.push({
          id: entry.block.id,
          type: entry.block.type,
          parentId: entry.parentId,
          slot: entry.slot,
          index: entry.index,
          ...(text ? { text: text.slice(0, 80) } : {}),
          ...(entry.block.className ? { className: entry.block.className } : {}),
        })
        if (matches.length >= 30) break
      }
      return ok({ matches }, `Found ${matches.length} block${matches.length === 1 ? '' : 's'}`)
    }

    case 'searchMedia': {
      const query = optionalString(input, 'query')
      if (query instanceof Error) return fail(query.message, 'Media search failed')
      const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(20, Math.max(1, Math.round(input.limit))) : 10
      try {
        const items = await env.searchMedia(query?.trim() ?? '', limit)
        return ok({ items }, `Found ${items.length} image${items.length === 1 ? '' : 's'}`)
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error), 'Media search failed')
      }
    }

    case 'getBindingSources': {
      const fields = env.bindingSources?.[String(input.collection)]
      if (!fields) return fail(`No bindable fields for "${String(input.collection)}"`, 'Fields')
      return ok({ collection: input.collection, fields }, 'Read document fields')
    }

    default:
      return fail(`Unknown tool "${name}"`, 'Unknown tool')
  }
}
