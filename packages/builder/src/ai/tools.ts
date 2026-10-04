// Tools of the editor's AI assistant. They work on an IN-MEMORY copy of the layout the user has
// open (the request's layout), never on the database: the editor applies the resulting operations
// and saves as usual. Inputs are validated here, because eager input streaming skips the API's
// own validation.

import type Anthropic from '@anthropic-ai/sdk'

import { isRichText, richTextToPlain, withoutBoundRequired } from '../core/bindings'
import { createId } from '../core/ids'
import { blockJsonSchema } from '../core/schema'
import { indexLayout, isPlainObject, subtreeIds } from '../core/tree'
import type { BindingField, Block, BlockDefinition, Layout, Operation, SectionDefinition } from '../core/types'
import { validateLayout, type LayoutError } from '../core/validate'
import { resolveOperations, splitLayoutErrors } from '../live/apply'
import { sectionInsertOps } from '../mcp/shared'

type BetaTool = Anthropic.Beta.BetaTool

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
  sections: SectionDefinition[]
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
  layout: Layout
  readonly #blocks: BlockDefinition[]
  readonly #baseline: Set<string>

  constructor(layout: Layout, blocks: BlockDefinition[]) {
    this.layout = layout
    this.#blocks = blocks
    this.#baseline = new Set(this.#errors(layout).blocking.map(errorKey))
  }

  #errors(layout: Layout) {
    return splitLayoutErrors(withoutBoundRequired(validateLayout(layout, this.#blocks), layout))
  }

  /** Applies operations. Returns the applied operations (duplicates as inserts) and warnings. */
  apply(ops: unknown[]): { ok: true; ops: Operation[]; warnings: LayoutError[] } | { ok: false; error: string; errors?: LayoutError[] } {
    const prepared = prepareOps(ops, this.layout)
    const resolved = resolveOperations(this.layout, prepared)
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
    'A block: { id?, type, props?, className?, slots?, bindings?, hidden? }. Children in slots have the same shape. Ids you leave out are generated; the tool result lists them.',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    props: { type: 'object' },
    className: { type: 'string' },
    slots: { type: 'object', description: 'Slot name -> array of child blocks.' },
    bindings: { type: 'object' },
    hidden: { type: 'boolean' },
  },
  required: ['type'],
} as const

/** Tool definitions in a fixed order (the order is part of the cached prompt prefix). */
export function toolDefinitions(env: ToolEnv): BetaTool[] {
  const types = env.blocks.map((b) => b.type)
  const sectionIds = env.sections.map((s) => s.id)
  const categories = [...new Set(env.sections.map((s) => s.category).filter((c): c is string => Boolean(c)))]
  const tools: BetaTool[] = [
    {
      name: 'getLayout',
      description:
        'Returns the current layout of the open page, including your changes so far in this reply. Call it when you need block ids or classes after several changes; the <editor_context> block already has the layout as it was when the user wrote.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    },
    {
      name: 'getBlockSchema',
      description:
        'Returns the JSON Schema of one block type: its props (with exact value shapes, e.g. links and rich text), className and slots. Call it before you write props whose shape the block catalog does not show.',
      input_schema: {
        type: 'object',
        properties: { type: { type: 'string', enum: types, description: 'Block type.' } },
        required: ['type'],
        additionalProperties: false,
      },
      strict: true,
    },
  ]
  if (env.sections.length > 0) {
    tools.push(
      {
        name: 'listSections',
        description:
          'Lists the ready-made sections. The system prompt already has their outlines; call this with full: true when you need the exact block JSON of sections before inserting or copying from them.',
        input_schema: {
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
          'Inserts a ready-made section into the open page. Use it to add whole page parts (hero, features, pricing, call to action, footer …). All ids are new; the result returns the inserted blocks with their ids, so you can adjust their text and classes with applyOperations "update" right away. Default position: the end of the page.',
        input_schema: {
          type: 'object',
          properties: {
            sectionId: { type: 'string', enum: sectionIds, description: 'Section id from the section catalog.' },
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
        '- update { id, props?, unsetProps?, className?, hidden?, bindings? }: props and bindings are merged (shallow); className REPLACES all classes, so send the full list; null removes it; a null binding removes that binding.',
        'Position: { parentId (null = page root), slot? (default "children"), index (final index in the target list) }.',
        'On success the result lists the changed ids and any warnings (e.g. a required prop is empty). On error nothing changes and the error names the failing operation; fix it and call again.',
      ].join('\n'),
      input_schema: {
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
                  },
                  required: ['type', 'id'],
                },
              ],
            },
          },
        },
        required: ['operations'],
      },
    },
    {
      name: 'findBlocks',
      description:
        'Finds blocks in the open page by type and/or text (case-insensitive, searches text props). Use it to locate "the pricing heading" or "all buttons" in a long page. Returns ids, types, positions and the start of the text.',
      input_schema: {
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
      input_schema: {
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
      input_schema: {
        type: 'object',
        properties: { collection: { type: 'string', enum: sourceSlugs } },
        required: ['collection'],
        additionalProperties: false,
      },
      strict: true,
    })
  }
  // Stream tool inputs as they are generated (applyOperations inputs can be long).
  return tools.map((tool) => ({ ...tool, eager_input_streaming: true }))
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

export async function runTool(name: string, rawInput: unknown, workspace: Workspace, env: ToolEnv): Promise<ToolOutcome> {
  const input = isPlainObject(rawInput) ? rawInput : null
  if (!input) return fail('The input must be a JSON object', 'Invalid input', { received: rawInput })

  switch (name) {
    case 'getLayout':
      return ok({ layout: workspace.layout }, 'Read the page')

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
          ...(s.category ? { category: s.category } : {}),
          ...(input.full === true ? { blocks: s.blocks } : {}),
        })),
        `Looked at ${list.length} section${list.length === 1 ? '' : 's'}`,
      )
    }

    case 'insertSection': {
      const section = env.sections.find((s) => s.id === input.sectionId)
      if (!section) return fail(`Unknown section "${String(input.sectionId)}"`, 'Section not inserted', { known: env.sections.map((s) => s.id) })
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
      const result = workspace.apply(ops)
      if (!result.ok) return fail(result.error, `Could not insert ${section.label}`, result.errors)
      const inserted = result.ops.flatMap((op) => (op.type === 'insert' ? [op.block] : []))
      return ok(
        { ok: true, section: section.id, inserted, ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}) },
        `Inserted ${section.label}`,
        result.ops,
      )
    }

    case 'applyOperations': {
      if (!Array.isArray(input.operations) || input.operations.length === 0) {
        return fail('"operations" must be a non-empty array', 'Edit failed')
      }
      const result = workspace.apply(input.operations)
      if (!result.ok) return fail(result.error, 'Edit failed', result.errors)
      return ok(
        {
          ok: true,
          applied: result.ops.length,
          changedIds: [...changedIds(result.ops)],
          // Generated ids, so the model can target new blocks right away.
          inserted: result.ops.flatMap((op) => (op.type === 'insert' ? [{ id: op.block.id, type: op.block.type, to: op.to }] : [])),
          ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
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
      for (const entry of indexLayout(workspace.layout).values()) {
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
