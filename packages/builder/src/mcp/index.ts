// MCP tools for the website builder, in the `payload-mcp-toolkit` `customTools` format.
// See docs/architecture.md section 13.
//
//   mcpToolkitPlugin({ customTools: builderMcpTools({ blocks, sections, collections }) })
//
// Every tool takes a `collection` argument and declares `routing: { kind: 'collection' }`, so the
// toolkit checks the API key's scope for that collection. Handlers run as the key's user with
// `overrideAccess: false`. Writes go through `applyLiveOperations`, the same code path as the
// live operations endpoint, so open editors show AI changes as they happen.

import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { z, type ZodTypeAny } from 'zod'

import { createId } from '../core/ids'
import { blockJsonSchema } from '../core/schema'
import { dataFields, optionValues } from '../core/fields'
import { indexLayout, normalizeLayout, subtreeIds, DEFAULT_SLOT } from '../core/tree'
import type { Block, BlockDefinition, Layout, Operation, SectionDefinition } from '../core/types'
import { validateLayout } from '../core/validate'
import { actorFromUser, applyLiveOperations, splitLayoutErrors, userLabel, type LiveDocStore } from '../live/apply'
import { liveRuntimeOf } from '../live/runtime'
import type { LiveActor } from '../live/types'

// ---------------------------------------------------------------------------
// Types (structurally compatible with payload-mcp-toolkit's ToolFactoryOutput)
// ---------------------------------------------------------------------------

export type McpToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

export type BuilderMcpTool = {
  name: string
  description: string
  parameters: Record<string, ZodTypeAny>
  routing: { kind: 'collection'; action: 'read' | 'update' }
  handler: (args: Record<string, unknown>, req: PayloadRequest, extra: unknown) => Promise<McpToolResult>
}

export type BuilderMcpCollection = {
  /** Name of the layout JSON field. Default "layout". */
  field?: string
  /** Frontend path of a document (the same function as in `websiteBuilder`). */
  url?: (doc: Record<string, unknown>) => string
}

export type BuilderMcpToolsOptions = {
  blocks: BlockDefinition[]
  sections?: SectionDefinition[]
  /** The same collections map as `websiteBuilder({ collections })`. */
  collections: Record<string, BuilderMcpCollection>
  /** Absolute site URL for `getPreviewUrl`. Default: Payload `serverURL`, then NEXT_PUBLIC_SERVER_URL, then the request origin. */
  siteUrl?: string
  /** Slug of payload-mcp-toolkit's API-keys collection, used to show the key name in the editor. */
  apiKeyCollection?: string
}

// ---------------------------------------------------------------------------
// Texts for the AI. Tool descriptions are prompts: keep them exact and complete.
// ---------------------------------------------------------------------------

const LAYOUT_GUIDE = `
LAYOUT MODEL. A layout is JSON: { "version": 1, "blocks": Block[] }. A Block is { id, type, props?, className?, slots?, hidden? }.
- id: a string, unique in the whole layout. Operations target blocks by id, never by array index. New blocks need new ids: use "b_" plus 6 lowercase letters or digits (e.g. "b_k3x9qa").
- type: a block type from listBlocks.
- props: the block's own values. Get the exact shape with getBlockSchema. Upload and relationship props hold document IDs.
- className: Tailwind CSS v4 utility classes, with variants such as md:, lg:, hover:, dark:. Theme classes work (bg-primary, text-primary-foreground, text-muted-foreground, font-heading). CSS is generated on save, so any valid class works.
- slots: child blocks by slot name, e.g. { "children": [ ...blocks ] }. Only block types with slots take children. listBlocks shows which types each slot accepts.
- Canonical form: leave out empty props, slots and bindings objects and empty slot lists. Set hidden only when true.
POSITION = { parentId, slot?, index }. parentId null means the page root, whose only slot is "children". slot defaults to "children". index is the block's FINAL index in the target list (0 = first; the list length = append). For a move inside the same list, count positions after the block is taken out.`.trim()

const NO_DIRECT_EDIT =
  'Do not change the layout field with updateDocument or patchLayout: those skip this format\'s checks and do not reach open editors.'

// ---------------------------------------------------------------------------
// Zod schemas for arguments
// ---------------------------------------------------------------------------

const positionSchema = z
  .object({
    parentId: z.string().nullable().describe('Id of the parent block, or null for the page root.'),
    slot: z.string().optional().describe('Slot of the parent. Default "children". The root has only "children".'),
    index: z.number().int().min(0).describe('Final index in the target list. The list length appends.'),
  })
  .describe('Where the block goes.')

const blockSchema = z
  .object({
    id: z.string().min(1).describe('New unique id, e.g. "b_k3x9qa".'),
    type: z.string().min(1).describe('Block type from listBlocks.'),
    props: z.record(z.string(), z.unknown()).optional(),
    className: z.string().optional().describe('Tailwind classes.'),
    slots: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional().describe('Child blocks by slot name. Children have the same shape.'),
    hidden: z.boolean().optional(),
  })
  .passthrough()

const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('insert'), block: blockSchema, to: positionSchema }).describe('Add a block (with its children) at a position.'),
  z.object({ type: z.literal('move'), id: z.string(), to: positionSchema }).describe('Move a block (with its children).'),
  z.object({ type: z.literal('remove'), id: z.string() }).describe('Delete a block and its children.'),
  z
    .object({
      type: z.literal('duplicate'),
      id: z.string(),
      newId: z.string().optional().describe('Id of the copy. Generated when left out. Children get new ids.'),
    })
    .describe('Copy a block right after itself.'),
  z
    .object({
      type: z.literal('update'),
      id: z.string(),
      props: z.record(z.string(), z.unknown()).optional().describe('Merged into the existing props (shallow). Other props stay.'),
      unsetProps: z.array(z.string()).optional().describe('Prop names to delete.'),
      className: z.string().nullable().optional().describe('Replaces ALL classes. Send the full class list. null removes it.'),
      hidden: z.boolean().optional(),
      bindings: z.record(z.string(), z.string().nullable()).optional(),
    })
    .describe('Change a block in place.'),
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(value: unknown): McpToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }
}

function fail(message: string, details?: unknown): McpToolResult {
  const body = details === undefined ? `Error: ${message}` : `Error: ${message}\n${JSON.stringify(details)}`
  return { content: [{ type: 'text', text: body }], isError: true }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A collection's config by slug. Loose: an app's generated types allow only its own slugs. */
function collectionConfig(req: PayloadRequest, collection: string): SanitizedCollectionConfig | undefined {
  return (req.payload.collections as Record<string, { config: SanitizedCollectionConfig } | undefined>)[collection]?.config
}

function hasDrafts(req: PayloadRequest, collection: string): boolean {
  return Boolean(collectionConfig(req, collection)?.versions?.drafts)
}

/** The latest draft of a document, read as the request's user. */
async function loadDraft(req: PayloadRequest, collection: string, id: string): Promise<Record<string, unknown>> {
  return (await req.payload.findByID({
    collection: collection as never,
    id,
    depth: 0,
    draft: hasDrafts(req, collection),
    overrideAccess: false,
    user: req.user,
    req,
  })) as Record<string, unknown>
}

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

/** Operations that insert a section's blocks at a position. Ids are regenerated. */
export function sectionInsertOps(
  layout: Layout,
  section: SectionDefinition,
  at: { parentId?: string | null; slot?: string; index?: number },
): Operation[] | string {
  const index = indexLayout(layout)
  const parentId = at.parentId ?? null
  const slot = at.slot ?? DEFAULT_SLOT
  if (parentId !== null && !index.has(parentId)) return `Parent block "${parentId}" not found`
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

function describeBlock(def: BlockDefinition) {
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
          { ...(slot.label ? { label: slot.label } : {}), accepts: slot.allow && !slot.allow.includes('*') ? slot.allow : 'any block' },
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
    ...(def.styles === false ? { className: 'not supported' } : {}),
    ...(def.defaultClassName ? { defaultClassName: def.defaultClassName } : {}),
    ...(def.ai?.example ? { example: def.ai.example } : {}),
  }
}

/** Block types used in a tree, with counts, for a short section summary. */
function outline(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((block) => {
    const label = typeof block.props?.text === 'string' ? ` "${String(block.props.text).slice(0, 40)}"` : ''
    const own = `${'  '.repeat(depth)}${block.type}${label}`
    const children = Object.values(block.slots ?? {}).flatMap((list) => outline(list, depth + 1))
    return [own, ...children]
  })
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function builderMcpTools(options: BuilderMcpToolsOptions): BuilderMcpTool[] {
  const { blocks, sections = [] } = options
  const slugs = Object.keys(options.collections)
  if (slugs.length === 0) throw new Error('[builderMcpTools] `collections` is empty.')
  const fieldOf = (collection: string) => options.collections[collection]?.field ?? 'layout'
  const apiKeyCollection = options.apiKeyCollection ?? 'payload-mcp-api-keys'
  const keyNames = new Map<string, { name: string | null; at: number }>()

  const collectionArg = z
    .enum(slugs as [string, ...string[]])
    .describe(`Collection of the page. One of: ${slugs.join(', ')}.`)
  const idArg = z.string().min(1).describe('Document id (from findDocument or searchContent).')

  /** The AI actor shown in the editor: the API key's name when it has one. */
  const aiActor = async (req: PayloadRequest): Promise<LiveActor> => {
    const user = req.user as (Record<string, unknown> & { _mcpKey?: { keyId?: unknown }; _strategy?: unknown }) | null
    const base = actorFromUser(user)
    const keyId = user?._mcpKey?.keyId
    const fallback = `AI agent (${userLabel(user)})`
    if (keyId === undefined || user?._strategy === 'mcp-toolkit-oauth') return { type: 'ai', id: base.id, label: fallback }
    const cacheKey = String(keyId)
    let cached = keyNames.get(cacheKey)
    if (!cached || Date.now() - cached.at > 5 * 60_000) {
      let name: string | null = null
      try {
        const key = await req.payload.findByID({ collection: apiKeyCollection as never, id: keyId as string, depth: 0, overrideAccess: true })
        const value = (key as unknown as { name?: unknown }).name
        name = typeof value === 'string' && value ? value : null
      } catch {
        name = null
      }
      cached = { name, at: Date.now() }
      keyNames.set(cacheKey, cached)
    }
    return { type: 'ai', id: base.id, label: cached.name ?? fallback }
  }

  const apply = async (
    req: PayloadRequest,
    collection: string,
    id: string,
    ops: unknown[] | ((layout: Layout) => Operation[] | string),
  ) =>
    applyLiveOperations({
      payload: req.payload as unknown as LiveDocStore,
      req,
      user: req.user,
      collection,
      id,
      field: fieldOf(collection),
      drafts: hasDrafts(req, collection),
      blocks,
      ops,
      actor: await aiActor(req),
      runtime: liveRuntimeOf(req.payload),
    })

  const listBlocks: BuilderMcpTool = {
    name: 'listBlocks',
    routing: { kind: 'collection', action: 'read' },
    description: [
      'Lists every block type you can use in page layouts: label, description, props, slots (which child types they accept) and an example. Call this before you build or edit a layout.',
      'To build whole page parts (hero, features, pricing, call to action, footer), PREFER ready-made sections: listSections, then insertSection. They are designed and tested. Use single blocks for small additions and edits.',
      LAYOUT_GUIDE,
    ].join('\n\n'),
    parameters: { collection: collectionArg },
    handler: async () =>
      text({
        blocks: blocks.map(describeBlock),
        sections: sections.length,
        next: 'getBlockSchema for exact prop shapes. listSections for ready-made sections. getLayout to read a page.',
      }),
  }

  const getBlockSchema: BuilderMcpTool = {
    name: 'getBlockSchema',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Returns the JSON Schema (draft 2020-12) of one block type: its props, className and slots, with nested child block schemas under $defs. Use it to write valid props.',
    parameters: { collection: collectionArg, type: z.string().min(1).describe('Block type from listBlocks.') },
    handler: async (args) => {
      const def = blocks.find((b) => b.type === args.type)
      if (!def) return fail(`Unknown block type "${String(args.type)}". Known types: ${blocks.map((b) => b.type).join(', ')}.`)
      return text(blockJsonSchema(def, blocks))
    },
  }

  const listSections: BuilderMcpTool = {
    name: 'listSections',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Lists ready-made sections (heroes, features, testimonials, calls to action, contact, footers, …) with an outline of their blocks. Sections are the best way to build a page: insert them with insertSection, then change their text, images and classes with applyOperations "update". Set `full: true` to get the complete block JSON of each section.',
    parameters: {
      collection: collectionArg,
      category: z.string().optional().describe('Only sections of this category, e.g. "Heroes".'),
      full: z.boolean().optional().describe('Include the full block JSON. Default false.'),
    },
    handler: async (args) => {
      const list = sections.filter((s) => !args.category || s.category === args.category)
      return text({
        categories: [...new Set(sections.map((s) => s.category).filter(Boolean))],
        sections: list.map((s) => ({
          id: s.id,
          label: s.label,
          ...(s.category ? { category: s.category } : {}),
          ...(s.description ? { description: s.description } : {}),
          ...(args.full ? { blocks: s.blocks } : { outline: outline(s.blocks).join('\n') }),
        })),
      })
    },
  }

  const insertSection: BuilderMcpTool = {
    name: 'insertSection',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Inserts a ready-made section (from listSections) into the draft of a document. All block ids are regenerated. Saves a draft (never publishes). People with the page open in the editor see the section appear live.',
      'Default position: the end of the page. Set parentId/slot/index to insert elsewhere (index = final index in the target list).',
      'Returns the inserted blocks with their NEW ids. Then adjust their text and classes with applyOperations "update".',
    ].join('\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      sectionId: z.string().min(1).describe('Section id from listSections.'),
      parentId: z.string().nullable().optional().describe('Parent block id. Default null (page root).'),
      slot: z.string().optional().describe('Slot of the parent. Default "children".'),
      index: z.number().int().min(0).optional().describe('Final index in the target list. Default: append.'),
    },
    handler: async (args, req) => {
      const section = sections.find((s) => s.id === args.sectionId)
      if (!section) return fail(`Unknown section "${String(args.sectionId)}". Known sections: ${sections.map((s) => s.id).join(', ')}.`)
      const collection = String(args.collection)
      const result = await apply(req, collection, String(args.id), (layout) =>
        sectionInsertOps(layout, section, {
          parentId: args.parentId as string | null | undefined,
          slot: args.slot as string | undefined,
          index: args.index as number | undefined,
        }),
      )
      if (!result.ok) return fail(result.error, result.errors)
      const inserted = result.ops.flatMap((op) => (op.type === 'insert' ? [op.block] : []))
      return text({
        ok: true,
        section: section.id,
        version: result.version,
        inserted,
        insertedIds: inserted.flatMap((b) => subtreeIds(b)),
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      })
    },
  }

  const getLayout: BuilderMcpTool = {
    name: 'getLayout',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Returns the current DRAFT layout of a document with every block id, plus `version` (the draft\'s updatedAt). Call it before applyOperations to get the ids you target. A person may edit the page at the same time, so read it again before a large change.',
    parameters: { collection: collectionArg, id: idArg },
    handler: async (args, req) => {
      const collection = String(args.collection)
      let doc: Record<string, unknown>
      try {
        doc = await loadDraft(req, collection, String(args.id))
      } catch (error) {
        return fail(errorMessage(error))
      }
      const titleField = collectionConfig(req, collection)?.admin?.useAsTitle
      return text({
        collection,
        id: doc.id,
        ...(titleField && typeof doc[titleField] === 'string' ? { title: doc[titleField] } : {}),
        ...(doc._status ? { status: doc._status } : {}),
        version: doc.updatedAt,
        layout: normalizeLayout(doc[fieldOf(collection)]),
      })
    },
  }

  const applyOperationsTool: BuilderMcpTool = {
    name: 'applyOperations',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Edits the layout of a document with a list of operations, applied in order, all or nothing. Saves a draft (never publishes). People with the page open in the editor see each change live.',
      'Operations: insert { block, to }, move { id, to }, remove { id }, duplicate { id, newId? }, update { id, props?, unsetProps?, className?, hidden? }. "update" merges props; className REPLACES all classes, so send the full list.',
      'If any operation fails, nothing is saved and the error names the failing operation. Call getLayout for current ids first. The result is validated against the block schemas: missing required props are allowed in drafts (warnings), wrong types and slot rules are errors.',
      NO_DIRECT_EDIT,
      LAYOUT_GUIDE,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      operations: z.array(operationSchema).min(1).describe('Operations, applied in order.'),
    },
    handler: async (args, req) => {
      const ops = (args.operations as Record<string, unknown>[]).map((op) =>
        op.type === 'duplicate' && !op.newId ? { ...op, newId: createId() } : op,
      )
      const result = await apply(req, String(args.collection), String(args.id), ops)
      if (!result.ok) return fail(result.error, result.errors)
      const changed = new Set<string>()
      for (const op of result.ops) {
        if (op.type === 'insert') subtreeIds(op.block).forEach((id) => changed.add(id))
        else if (op.type === 'move' || op.type === 'update') changed.add(op.id)
      }
      return text({
        ok: true,
        version: result.version,
        applied: result.ops.length,
        changedIds: [...changed],
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      })
    },
  }

  const validateLayoutTool: BuilderMcpTool = {
    name: 'validateLayout',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Checks a layout against the block schemas without saving. Pass `layout` (the JSON object) to check a layout you wrote, or only `id` to check the document\'s current draft. Returns `errors` (block a save) and `warnings` (allowed in drafts: missing required props, unknown props).',
    parameters: {
      collection: collectionArg,
      id: idArg.optional(),
      layout: z.unknown().optional().describe('A layout { version: 1, blocks: [...] }. Leave out to check the saved draft.'),
    },
    handler: async (args, req) => {
      let layout: unknown = args.layout
      if (typeof layout === 'string') {
        try {
          layout = JSON.parse(layout)
        } catch {
          return fail('`layout` is not valid JSON')
        }
      }
      if (layout === undefined) {
        if (!args.id) return fail('Pass `layout` or `id`.')
        try {
          const doc = await loadDraft(req, String(args.collection), String(args.id))
          layout = normalizeLayout(doc[fieldOf(String(args.collection))])
        } catch (error) {
          return fail(errorMessage(error))
        }
      }
      const { blocking, warnings } = splitLayoutErrors(validateLayout(layout, blocks))
      return text({ valid: blocking.length === 0, errors: blocking, warnings })
    },
  }

  const getPreviewUrl: BuilderMcpTool = {
    name: 'getPreviewUrl',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Returns the links of a document: `url` (the public page), `previewUrl` (the draft preview, when the site has one) and `editorUrl` (the admin Builder tab, where a person can watch your changes live). Give these links to the user.',
    parameters: { collection: collectionArg, id: idArg },
    handler: async (args, req) => {
      const collection = String(args.collection)
      let doc: Record<string, unknown>
      try {
        doc = await loadDraft(req, collection, String(args.id))
      } catch (error) {
        return fail(errorMessage(error))
      }
      const site = (
        options.siteUrl ||
        req.payload.config.serverURL ||
        process.env.NEXT_PUBLIC_SERVER_URL ||
        (req.url ? new URL(req.url).origin : '')
      ).replace(/\/$/, '')
      const absolute = (path: string | null | undefined) =>
        !path ? undefined : /^https?:\/\//.test(path) ? path : `${site}${path.startsWith('/') ? '' : '/'}${path}`

      const pathOf = options.collections[collection]?.url
      let url: string | undefined
      try {
        url = absolute(pathOf?.(doc))
      } catch {
        url = undefined
      }
      const previewUrl = absolute(await draftPreviewPath(req, collection, doc))
      const adminRoute = req.payload.config.routes?.admin ?? '/admin'
      return text({
        ...(url ? { url } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        editorUrl: `${site}${adminRoute}/collections/${collection}/${String(doc.id)}/builder`,
        ...(doc._status ? { status: doc._status } : {}),
        ...(doc._status === 'draft' ? { note: 'Changes are saved as a draft. The public url shows them after publishing.' } : {}),
      })
    },
  }

  return [listBlocks, getBlockSchema, listSections, insertSection, getLayout, applyOperationsTool, validateLayoutTool, getPreviewUrl]
}

/** The draft preview path from the collection's `admin.livePreview.url` or `admin.preview`. */
async function draftPreviewPath(req: PayloadRequest, collection: string, doc: Record<string, unknown>): Promise<string | null> {
  const config = collectionConfig(req, collection)
  if (!config) return null
  const admin = (config.admin ?? {}) as { livePreview?: { url?: unknown }; preview?: unknown }
  const locale = (req as { locale?: string }).locale ?? 'en'
  try {
    const live = admin.livePreview?.url
    if (typeof live === 'string') return live
    if (typeof live === 'function') {
      const value: unknown = await live({ data: doc, collectionConfig: config, locale: { code: locale, label: locale }, req, payload: req.payload })
      if (typeof value === 'string' && value) return value
    }
    if (typeof admin.preview === 'function') {
      const value: unknown = await admin.preview(doc, { locale, req, token: null })
      if (typeof value === 'string' && value) return value
    }
  } catch {
    return null
  }
  return null
}

export { LAYOUT_GUIDE }
export type { LiveActor }
