// MCP tools for the website builder, in the `payload-mcp-toolkit` `customTools` format.
// See docs/architecture.md section 13.
//
//   mcpToolkitPlugin({ customTools: builderMcpTools({ blocks, sections, collections }) })
//
// Every tool takes a `collection` argument and declares `routing: { kind: 'collection' }`, so the
// toolkit checks the API key's scope for that collection. Handlers run as the key's user with
// `overrideAccess: false`. Writes are commits to the document's live session, the same path as
// the editor's own edits, so AI changes merge with people's edits as they happen.

import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { z, type ZodTypeAny } from 'zod'

import {
  COLLECTION_LIST_BLOCK,
  REPEAT_BLOCK,
  DEFAULT_TEMPLATES_SLUG,
  FIELD_BLOCK,
  TEMPLATE_CONDITIONS_FIELD,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_PREVIEW_FIELD,
  TEMPLATE_PRIORITY_FIELD,
  TEMPLATE_TARGET_FIELD,
  templateConditions,
  withoutBoundRequired,
} from '../core/bindings'
import { createId } from '../core/ids'
import { VISIBILITY_OPERATORS } from '../core/visibility'
import { blockJsonSchema } from '../core/schema'
import { checkSectionVariants, getBlockDefinition, sectionsWithDefaultClassNames } from '../core/blocks'
import { findSectionVersion } from '../core/sections'
import { localeSettingsOf, localizedKeys, resolveLayoutLocale, stampLocale, untranslatedKeys } from '../core/locale'
import { normalizeLayout, subtreeIds, walkBlocks } from '../core/tree'
import type { BlockDefinition, Layout, LocaleSettings, Operation, SectionDefinition } from '../core/types'
import { runPropValidators } from '../core/fieldValidate'
import { validateLayout } from '../core/validate'
import { actorFromUser, splitLayoutErrors, userLabel, type LiveDocStore } from '../live/apply'
import { canEditDesign } from '../live/contentMode'
import { fieldRegistryOf, propAccessCheck } from '../live/fieldChecks'
import { builderConfigOf } from '../live/document'
import { DRAFT_NOT_READABLE_MESSAGE, liveReadProblem, withLiveReadCheck } from '../live/draftAccess'
import { blocksAccessProblem, codecOf, withBlocksReadCheck } from '../live/storage'
import { liveRuntimeOf } from '../live/runtime'
import type { CommitResult } from '../live/session'
import type { LiveActor } from '../live/types'
import { storedLayout } from '../plugin/hook'
import { builderViewPath, documentPath, draftPreviewPath } from '../plugin/links'
import { siteCssConfigOf } from '../plugin'
import { prepareBlocks } from '../plugin/listCollections'
import { getStyleTokens } from '../css'
import { themeVariablesOf, withThemeVariables } from '../theme/server'
import { describeVariables, variableTokens, VARIABLES_NOTE } from '../theme/variables'
import { DEFAULT_SAVED_SECTIONS_SLUG, loadSavedSections, savedSectionsConfigOf } from '../plugin/sections'
import { templatesConfigOf } from '../plugin/templates'
import { generateImageToMedia, imageServiceOf } from '../ai/images/service'
import { IMAGE_ASPECT_RATIOS } from '../ai/images/ratios'
import { SECTION_REF_BLOCK } from '../blocks/builtins/sectionRef'
import { classesConfigOf, loadClasses, mergeSiteClasses } from '../classes'
import { classMcpTools } from '../classes/mcp'
import {
  BINDINGS_GUIDE,
  changeSummary,
  componentListing,
  contextOnlyWarnings,
  describeBlock,
  layoutGuide,
  missingContent,
  missingContentHint,
  outline,
  repairRootParents,
  sectionInsertOps,
  sectionToInsert,
  touchedIds,
  variantsListing,
  withNewIds,
} from './shared'

// ---------------------------------------------------------------------------
// Types (structurally compatible with payload-mcp-toolkit's ToolFactoryOutput)
// ---------------------------------------------------------------------------

export type McpToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

export type BuilderMcpTool = {
  name: string
  description: string
  parameters: Record<string, ZodTypeAny>
  routing: { kind: 'collection'; action: 'read' | 'update' | 'create' | 'delete' }
  handler: (args: Record<string, unknown>, req: PayloadRequest, extra: unknown) => Promise<McpToolResult>
}

export type BuilderMcpCollection = {
  /** Name of the layout JSON field. Default "layout". */
  field?: string
  /** Frontend path of a document (the same function as in `websiteBuilder`). */
  url?: (doc: Record<string, unknown>) => string
  /** The documents render through templates (the same flag as in `websiteBuilder`). */
  templates?: boolean
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
  /** The same `templates` options as `websiteBuilder`. Templates are on when a collection sets `templates: true`. */
  templates?: { slug?: string }
  /** The upload collection `generateImage` saves to: the same as `websiteBuilder({ ai: { mediaCollection } })`. Default "media". */
  mediaCollection?: string
  /**
   * The class tools (listClasses, getClass, upsertClass, deleteClass) for the editable classes of
   * `websiteBuilder({ classes })`. On by default; `false` leaves them out. `slug`: the same as
   * `classes.slug` there.
   */
  classes?: { slug?: string } | false
}

// ---------------------------------------------------------------------------
// Texts for the AI. Tool descriptions are prompts: keep them exact and complete.
// ---------------------------------------------------------------------------

/** The long format guide. listBlocks returns it (`guide`), so tool descriptions stay short. */
const LAYOUT_GUIDE = layoutGuide('listBlocks')

const NO_DIRECT_EDIT =
  'Builder layouts change only through applyOperations and insertSection. Never write the layout field with updateDocument or patchLayout: they skip these checks and do not reach open editors.'

// ---------------------------------------------------------------------------
// Zod schemas for arguments
// ---------------------------------------------------------------------------

/**
 * `motion` is a loose object here: the operations check it (kinds, presets, ranges) and return the
 * exact error, so the spec lives in core/motion.ts only. Layout guide: MOTION.
 */
const motionArg = z.record(z.string(), z.unknown())
const MOTION_HINT =
  'Animations: { enter?, hover?, press?, scroll?, loop? }, each kind { preset, ...options }, e.g. { "enter": { "preset": "fade-up" } } (MOTION in the listBlocks guide).'

/**
 * `visibility` is a loose object here too: the operations check it (core/visibility.ts) and return
 * the exact error. The format is VISIBILITY in the bindings guide (listBlocks).
 */
const visibilityArg = z
  .record(z.string(), z.unknown())
  .describe(
    `{ match?: "all" | "any", conditions: [{ field, operator, value?, valueField?, count? }] }. Operators: ${VISIBILITY_OPERATORS.join(', ')}. Shows the block only when the conditions match the current document: only in templates and in list or repeat items (on a normal page it does nothing). Full format: VISIBILITY in the listBlocks bindings guide.`,
  )

const attrsArg = z
  .object({
    id: z.string().nullable().optional().describe('The element id, for "#id" links. Unique in the layout. Letters, digits, - and _, starting with a letter.'),
    ariaLabel: z.string().nullable().optional().describe('aria-label: the name screen readers read.'),
    ariaHidden: z.boolean().nullable().optional().describe('true: aria-hidden, screen readers skip the block (decorative shapes, repeated links).'),
  })
  .describe('HTML attributes of the block element.')

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
    bindings: z.record(z.string(), z.string()).optional().describe('Prop path -> document field path (templates and list items).'),
    slots: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional().describe('Child blocks by slot name. Children have the same shape.'),
    hidden: z.boolean().optional(),
    editableItems: z.boolean().optional().describe('Content mode: true lets editors without design rights duplicate, delete and reorder the direct children of this block (FAQ items, cards). Set it on the list, not the items.'),
    label: z.string().optional().describe('Name for editors, shown in the outline (e.g. "Hero"). Never rendered. Give each top-level section one.'),
    motion: motionArg.optional().describe(MOTION_HINT),
    attrs: attrsArg.optional(),
    visibility: visibilityArg.optional(),
    partClassName: z.record(z.string(), z.string()).optional().describe('Tailwind classes of the block\'s inner elements, by part name. Only the "parts" listed in listBlocks take them.'),
    section: z
      .object({ id: z.string().min(1), variant: z.string().optional() })
      .optional()
      .describe('Set by insertSection on the root block of a ready-made section. Keep it when you copy the block; never set it yourself.'),
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
      addClassName: z.string().optional().describe('Classes to add, space-separated, e.g. "shadow-lg md:p-8". Other classes stay. Runs after className and removeClassName.'),
      removeClassName: z.string().optional().describe('Classes to remove, space-separated, exact match ("p-4" leaves "md:p-4"). Other classes stay.'),
      hidden: z.boolean().optional(),
      editableItems: z.boolean().optional().describe('Content mode: true lets editors without design rights duplicate, delete and reorder the direct children of this block (FAQ items, cards). Set it on the list, not the items.'),
      label: z.string().nullable().optional().describe('Name for editors (outline). null or "" removes it.'),
      bindings: z
        .record(z.string(), z.string().nullable())
        .optional()
        .describe('Merged into the existing bindings: prop path -> document field path. null removes a binding.'),
      motion: motionArg
        .nullable()
        .optional()
        .describe(`${MOTION_HINT} Merges per kind: a kind you send replaces that kind, null removes a kind, kinds you leave out stay. null removes all motion.`),
      attrs: attrsArg.nullable().optional().describe('HTML attributes. A key replaces that key, null removes it. null removes all.'),
      visibility: visibilityArg.nullable().optional().describe('Visibility conditions (format as in insert). Replaces all conditions; null removes them.'),
      partClassName: z
        .record(z.string(), z.string().nullable())
        .optional()
        .describe('Classes of the block\'s inner elements, by part name (the "parts" in listBlocks). Each part given replaces its classes; null removes them.'),
      locale: z
        .string()
        .optional()
        .describe('Localized documents: the locale whose values `props` and `unsetProps` change (default: the tool\'s `locale`, else the default locale).'),
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

/**
 * The document's locales: the plugin's setting for the collection (it may turn localization off),
 * else Payload's `localization`. Null when the layout is not localized.
 */
function localizationOf(req: PayloadRequest, collection: string): LocaleSettings | null {
  const plugin = builderConfigOf(req.payload)?.collections[collection]
  if (plugin && 'localization' in plugin) return plugin.localization ?? null
  return localeSettingsOf(req.payload.config.localization)
}

/** Reads the tool's `locale` argument. A string error when the locale is unknown. */
function localeArgOf(req: PayloadRequest, collection: string, value: unknown): { settings: LocaleSettings | null; locale: string | null } | string {
  const settings = localizationOf(req, collection)
  if (value === undefined || value === null || value === '') return { settings, locale: null }
  if (typeof value !== 'string') return '`locale` must be a locale code.'
  if (value === 'all') return { settings, locale: 'all' }
  if (!settings) return `This document has no locales. Leave out \`locale\`.`
  if (!settings.locales.includes(value)) return `Unknown locale "${value}". Use one of: ${settings.locales.join(', ')}.`
  return { settings, locale: value }
}

/** The localized props of the block types a layout uses: `{ heading: ['text'] }`. */
function localizedPropsOf(layout: Layout, blocks: readonly BlockDefinition[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  walkBlocks(layout, (block) => {
    if (out[block.type]) return
    const keys = [...localizedKeys(getBlockDefinition(blocks, block.type))]
    if (keys.length > 0) out[block.type] = keys
  })
  return out
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

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** The site's own `@utility` classes for `listBlocks`, or nothing without the plugin's CSS config. */
async function siteClassesOf(req: PayloadRequest | undefined): Promise<Record<string, unknown>> {
  const site = req?.payload?.config ? siteCssConfigOf(req.payload) : null
  if (!site) return {}
  const code = await getStyleTokens(await withThemeVariables(req!.payload, site.css))
    .then((tokens) => tokens.siteClasses ?? [])
    .catch(() => [])
  // The editable classes (the classes collection) first; code classes they replace are left out.
  const editable = req && classesConfigOf(req.payload) ? await loadClasses(req).catch(() => []) : []
  const list = mergeSiteClasses(editable, code)
  if (list.length === 0) return {}
  return {
    siteClasses: list.map(({ name, label, group }) => ({ name, ...(label ? { label } : {}), ...(group ? { group } : {}) })),
    siteClassesNote:
      "The site's own classes (its look: type styles, buttons, cards, surfaces). Prefer them in className over rebuilding the same look from utilities." +
      (editable.length > 0 ? ' listClasses shows their styles; upsertClass changes a class for every block that uses it.' : ''),
  }
}

/** The theme's design variables for `listBlocks`, or nothing without them. */
async function variablesOf(req: PayloadRequest | undefined): Promise<Record<string, unknown>> {
  if (!req?.payload?.config) return {}
  const list = variableTokens(await themeVariablesOf(req.payload))
  return list.length > 0 ? { variables: describeVariables(list), variablesNote: VARIABLES_NOTE } : {}
}

export function builderMcpTools(options: BuilderMcpToolsOptions): BuilderMcpTool[] {
  const templateTargets = Object.entries(options.collections).filter(([, c]) => c.templates).map(([slug]) => slug)
  const templatesSlug = templateTargets.length > 0 ? (options.templates?.slug ?? DEFAULT_TEMPLATES_SLUG) : null
  const listable = Object.entries(options.collections).filter(([, c]) => c.url).map(([slug]) => slug)
  // The same block list the plugin validates against (collection list: only collections with a url;
  // the live saved section block, which the plugin adds when saved sections are on).
  const blocks = prepareBlocks(options.blocks, listable, DEFAULT_SAVED_SECTIONS_SLUG)
  // A section block without a className gets its type's default classes, as in the plugin.
  // Variants stay under their section (core/sections.ts); insertSection takes `variant`.
  checkSectionVariants(options.sections ?? [])
  const sections = sectionsWithDefaultClassNames(options.sections ?? [], blocks)
  const collections: Record<string, BuilderMcpCollection> = templatesSlug
    ? { ...options.collections, [templatesSlug]: { field: TEMPLATE_LAYOUT_FIELD } }
    : options.collections
  const slugs = Object.keys(collections)
  if (slugs.length === 0) throw new Error('[builderMcpTools] `collections` is empty.')
  const fieldOf = (collection: string) => collections[collection]?.field ?? 'layout'
  const apiKeyCollection = options.apiKeyCollection ?? 'payload-mcp-api-keys'
  const keyNames = new Map<string, { name: string | null; at: number }>()

  const collectionEnum = z
    .enum(slugs as [string, ...string[]])
    .describe(
      `Collection of the page. One of: ${slugs.join(', ')}.` +
        (templatesSlug ? ` "${templatesSlug}" holds templates (layouts for every document of a collection).` : ''),
    )
  // With one builder collection the argument may be left out. The default fills it in before the
  // toolkit's scope check reads it.
  const collectionArg = slugs.length === 1 ? collectionEnum.default(slugs[0]!) : collectionEnum
  /**
   * True when the collection's layouts render without a current document (normal pages): there,
   * bindings and visibility outside list and repeat items do nothing. Templates and saved sections
   * (which may go into templates) are left out.
   */
  const rendersWithoutDocument = (req: PayloadRequest, collection: string) =>
    collection !== templatesSlug && collection !== savedSectionsConfigOf(req.payload)?.slug
  const idArg = z.string().min(1).describe('Document id (from findDocument or searchContent).')
  const localeArg = z
    .string()
    .optional()
    .describe('Localized sites: the locale to read or write, e.g. "de". Default: the default locale. getLayout also takes "all" (every locale\'s values, as stored).')

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

  /** Commits operations to the document's live session as the AI collaborator. */
  const apply = async (
    req: PayloadRequest,
    collection: string,
    id: string,
    ops: unknown[] | ((layout: Layout) => Operation[] | string),
  ): Promise<CommitResult> => {
    const runtime = liveRuntimeOf(req.payload)
    const drafts = collectionConfig(req, collection)?.versions?.drafts
    if (!(await runtime.canUpdate(req, collection, id))) {
      return { ok: false, status: 403, error: 'Not allowed to edit this document (or it does not exist).', seq: 0 }
    }
    const target = {
      collection,
      id,
      field: fieldOf(collection),
      drafts: Boolean(drafts),
      autosave: typeof drafts === 'object' && Boolean(drafts.autosave),
      // The collection's own Payload blocks field keeps its codec (live/storage.ts).
      codec: codecOf(builderConfigOf(req.payload)?.collections[collection]),
    }
    // A Payload blocks field: only users who may read all of it and update it use the session.
    // The session holds the document as a draft: only users who may read it so change it.
    const stale = await liveReadProblem(req, target).catch(() => DRAFT_NOT_READABLE_MESSAGE)
    if (stale) return { ok: false, status: 403, error: stale, seq: 0 }
    const denied = await blocksAccessProblem(req, target, { write: true, layouts: [runtime.sessions.peek(collection, id)?.layout] })
    if (denied) return { ok: false, status: 403, error: denied, seq: 0 }
    const result = await runtime.sessions.commit({
      target,
      store: req.payload as unknown as LiveDocStore,
      user: req.user,
      actor: await aiActor(req),
      ops,
      blocks,
      localization: localizationOf(req, collection),
      contentOnly: !(await canEditDesign(req)),
      // As for people's edits, inside the commit: the user may still read the draft; field access
      // of block props; a Payload blocks field: and no value the user may not read, in any state.
      access: withLiveReadCheck(
        req,
        target,
        withBlocksReadCheck(
          req,
          target,
          propAccessCheck(req, {
            blocks,
            registry: fieldRegistryOf(req.payload),
            collection,
            id,
            field: fieldOf(collection),
            localization: localizationOf(req, collection),
          }),
        ),
      ),
    })
    return result
  }

  /**
   * The warnings of a commit for the blocks it touched (publish-only problems, unknown keys, and
   * bindings or visibility that do nothing on a normal page), plus how many other blocks have
   * warnings. Required props that a binding fills are left out, as in validateLayout.
   */
  const touchedWarnings = (req: PayloadRequest, collection: string, result: Extract<CommitResult, { ok: true }>) => {
    const touched = touchedIds(result.ops)
    const all = [
      ...withoutBoundRequired(result.warnings, result.layout),
      ...(rendersWithoutDocument(req, collection) ? contextOnlyWarnings(result.layout) : []),
    ]
    const own = all.filter((warning) => warning.blockId !== undefined && touched.has(warning.blockId))
    const elsewhere = all.length - own.length
    return {
      ...(own.length > 0 ? { warnings: own.slice(0, 30) } : {}),
      ...(elsewhere > 0 ? { otherWarnings: `${elsewhere} warning${elsewhere === 1 ? '' : 's'} on blocks this call did not change (validateLayout lists them).` } : {}),
    }
  }

  /** The app's sections, then the saved sections the request's user can read (when turned on). */
  const allSections = async (req: PayloadRequest): Promise<SectionDefinition[]> => {
    const saved = savedSectionsConfigOf(req.payload)
    return saved ? [...sections, ...(await loadSavedSections(req, saved.slug))] : sections
  }

  /**
   * The layout people see now: the open live session's, else the saved draft's. Stored form (every
   * locale): the draft read gives one locale's view, so a localized layout comes from the database.
   */
  const currentLayout = async (req: PayloadRequest, collection: string, doc: Record<string, unknown>) => {
    const codec = codecOf(builderConfigOf(req.payload)?.collections[collection])
    const open = liveRuntimeOf(req.payload).sessions.peek(collection, String(doc.id))
    // The session holds the document as a draft: a user who may read only other versions gets nothing from it.
    if (open) {
      const target = { collection, id: doc.id as string | number, field: fieldOf(collection), drafts: hasDrafts(req, collection) }
      const stale = await liveReadProblem(req, target).catch(() => DRAFT_NOT_READABLE_MESSAGE)
      if (stale) throw new Error(stale)
    }
    // A Payload blocks field: the session holds every value, also ones this user may not read.
    if (codec.kind === 'payload-blocks') {
      const target = { collection, id: doc.id as string | number, field: fieldOf(collection), drafts: hasDrafts(req, collection), codec }
      const unreadable = await blocksAccessProblem(req, target, { write: false, layouts: [open?.layout] })
      if (unreadable) throw new Error(unreadable)
    }
    if (open) return { layout: open.layout, seq: open.seq }
    if (codec.kind === 'payload-blocks') return { layout: codec.decode(doc[fieldOf(collection)]) }
    const config = collectionConfig(req, collection)
    const stored = localizationOf(req, collection) && config && doc.id !== undefined ? await storedLayout(req, config, doc.id as string | number, fieldOf(collection)) : null
    return { layout: stored ?? normalizeLayout(doc[fieldOf(collection)]) }
  }

  const listBlocks: BuilderMcpTool = {
    name: 'listBlocks',
    routing: { kind: 'collection', action: 'read' },
    description: [
      'Lists every block type you can use in page layouts: label, description, props, slots (which child types they accept), parts and an example, plus the site\'s own classes and design variables (named colors, sizes and fonts). Call it once before you build or edit a layout: its `guide` is the layout format (block keys, ids, positions, classes, motion presets, HTML attrs, canonical form) and `bindings` the binding and VISIBILITY format.',
      'For whole page parts (hero, features, pricing, call to action, footer), PREFER ready-made sections: listSections, then insertSection. Use single blocks for small additions and edits.',
      `Dynamic blocks: "${FIELD_BLOCK}" shows one field of the current document (templates), "${COLLECTION_LIST_BLOCK}" lists documents of a collection and repeats its "item" slot per document, "${REPEAT_BLOCK}" repeats its "item" slot per row of an array or hasMany field of the current document.`,
    ].join('\n\n'),
    parameters: { collection: collectionArg },
    handler: async (_args, req) =>
      text({
        guide: LAYOUT_GUIDE,
        blocks: blocks.map(describeBlock),
        ...(await siteClassesOf(req)),
        ...(await variablesOf(req)),
        sections: sections.length,
        bindings: BINDINGS_GUIDE,
        ...(templatesSlug ? { templates: { collection: templatesSlug, targets: templateTargets } } : {}),
        next:
          'getBlockSchema for exact prop shapes. listSections for ready-made sections. getLayout to read a page.' +
          (templatesSlug ? ' listTemplates and getBindingSources for templates.' : ''),
      }),
  }

  const getBlockSchema: BuilderMcpTool = {
    name: 'getBlockSchema',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Returns the JSON Schema (draft 2020-12) of one block type: its props, className, slots and motion (animations, under $defs.$motion), with nested child block schemas under $defs. Use it to write valid props.',
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
    description: [
      'Lists ready-made sections (heroes, features, testimonials, calls to action, contact, footers, …) with an outline of their blocks. Sections are the best way to build a page: insert them with insertSection, then change their text, images and classes with applyOperations "update". Set `full: true` to get the complete block JSON of each section.',
      'A section can come in variants (other versions of the same section, e.g. a split hero): they are listed under it in `variants`. Pick the version that fits the page and pass its id as `variant` to insertSection.',
      'The list also has the sections people saved on this site. They have `saved: true` and an id like "saved:12".',
      'A saved section with `component: true` is a component: insertSection puts in a copy that stays in sync with it, and each copy sets its own `values` for the listed `properties` (text, richText as plain text, image as an upload id, link as a URL or { type, url }, visible as true/false). A property left out shows its `default`.',
    ].join('\n'),
    parameters: {
      collection: collectionArg,
      category: z.string().optional().describe('Only sections of this category, e.g. "Heroes".'),
      full: z.boolean().optional().describe('Include the full block JSON. Default false.'),
    },
    handler: async (args, req) => {
      const all = await allSections(req)
      const list = all.filter((s) => !args.category || s.category === args.category)
      return text({
        categories: [...new Set(all.map((s) => s.category).filter(Boolean))],
        sections: list.map((s) => ({
          id: s.id,
          label: s.label,
          ...(s.savedId !== undefined ? { saved: true } : {}),
          ...(s.category ? { category: s.category } : {}),
          ...(s.description ? { description: s.description } : {}),
          ...(args.full ? { blocks: s.blocks } : { outline: outline(s.blocks).join('\n') }),
          ...variantsListing(s, args.full === true),
          ...componentListing(s, blocks),
        })),
      })
    },
  }

  const insertSection: BuilderMcpTool = {
    name: 'insertSection',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Inserts a ready-made or saved section (from listSections) into the draft of a document. All block ids are regenerated. Saves a draft about a second later (never publishes). People with the page open in the editor see the section appear live.',
      'Default position: the end of the page. Set parentId/slot/index to insert elsewhere (index = final index in the target list).',
      'Returns the inserted blocks with their NEW ids, and `needsContent`: blocks whose image, form or other upload or relationship is still empty (fill them with generateImage, an existing upload, or findDocument). Then adjust text and classes with applyOperations "update".',
      'Components (`component: true` in listSections) go in as one copy that stays in sync: pass `values` ({ <property name>: value }) for its properties. To change a copy later, "update" its props.values. linked: false inserts plain blocks the page can change freely (values still fill them).',
    ].join('\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      sectionId: z
        .string()
        .min(1)
        .describe('The section from listSections: its id (e.g. "hero" or "saved:12") or its exact name.'),
      variant: z.string().optional().describe('A variant id from the section\'s `variants` in listSections, e.g. "split". Leave it out for the section itself.'),
      parentId: z.string().nullable().optional().describe('Parent block id. Default null (page root).'),
      slot: z.string().optional().describe('Slot of the parent. Default "children".'),
      index: z.number().int().min(0).optional().describe('Final index in the target list. Default: append.'),
      values: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Components only: values for its properties, by property name (see `properties` in listSections).'),
      linked: z
        .boolean()
        .optional()
        .describe('Saved sections only. true: a copy that stays in sync with the saved section (default for components). false: plain blocks.'),
    },
    handler: async (args, req) => {
      const all = await allSections(req)
      const found = findSectionVersion(all, String(args.sectionId), typeof args.variant === 'string' ? args.variant : undefined)
      if (typeof found === 'string') return fail(found)
      if (!found) {
        const known = all.map((s) => (s.savedId !== undefined ? `${s.id} ("${s.label}")` : s.id))
        return fail(`Unknown section "${String(args.sectionId)}". Known sections: ${known.join(', ') || 'none'}.`)
      }
      const section = sectionToInsert(found, blocks, { values: args.values, linked: typeof args.linked === 'boolean' ? args.linked : null })
      if (typeof section === 'string') return fail(section)
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
      const needsContent = missingContent(inserted, blocks)
      const warnings = touchedWarnings(req, collection, result)
      return text({
        ok: true,
        section: section.id,
        ...(section.blocks[0]?.type === SECTION_REF_BLOCK ? { linked: true } : {}),
        ...(section.blocks[0]?.section?.variant ? { variant: section.blocks[0].section.variant } : {}),
        seq: result.seq,
        inserted,
        insertedIds: inserted.flatMap((b) => subtreeIds(b)),
        ...(needsContent.length > 0
          ? { needsContent, needsContentHint: missingContentHint(needsContent, { generateImage: Boolean(imageServiceOf(req.payload)?.adapter) }) }
          : {}),
        ...warnings,
      })
    },
  }

  const getLayout: BuilderMcpTool = {
    name: 'getLayout',
    routing: { kind: 'collection', action: 'read' },
    description: [
      'Returns the current DRAFT layout of a document with every block id, including unsaved live edits by people who have the page open, plus `version` (the saved draft\'s updatedAt). Call it before applyOperations to get the ids you target. A person may edit the page at the same time, so read it again before a large change.',
      'Localized sites (the result has `localization`): every locale shares one structure (blocks, order, classes); only localized props (`localizedProps`) differ per locale. Pass `locale` to read that locale\'s values: props it has not translated show the fallback value and are listed in `untranslated` (block id -> props). To translate, call applyOperations with the same `locale` and "update" ops for those props.',
    ].join('\n\n'),
    parameters: { collection: collectionArg, id: idArg, locale: localeArg },
    handler: async (args, req) => {
      const collection = String(args.collection)
      const at = localeArgOf(req, collection, args.locale)
      if (typeof at === 'string') return fail(at)
      let doc: Record<string, unknown>
      try {
        doc = await loadDraft(req, collection, String(args.id))
      } catch (error) {
        return fail(errorMessage(error))
      }
      const titleField = collectionConfig(req, collection)?.admin?.useAsTitle
      let current: Awaited<ReturnType<typeof currentLayout>>
      try {
        current = await currentLayout(req, collection, doc)
      } catch (error) {
        return fail(errorMessage(error))
      }
      const { settings } = at
      let localized: Record<string, unknown> = {}
      if (settings) {
        const locale = at.locale ?? settings.defaultLocale
        const untranslated: Record<string, string[]> = {}
        if (locale !== 'all') {
          walkBlocks(current.layout, (block) => {
            const keys = untranslatedKeys(block, blocks, settings, locale)
            if (keys.length > 0) untranslated[block.id] = keys
          })
        }
        localized = {
          locale,
          localization: { defaultLocale: settings.defaultLocale, locales: settings.locales, fallback: settings.fallback },
          localizedProps: localizedPropsOf(current.layout, blocks),
          ...(Object.keys(untranslated).length > 0 ? { untranslated } : {}),
          ...(locale === 'all' ? {} : { layout: resolveLayoutLocale(current.layout, blocks, settings, locale) }),
        }
      }
      return text({
        collection,
        id: doc.id,
        ...(titleField && typeof doc[titleField] === 'string' ? { title: doc[titleField] } : {}),
        ...(doc._status ? { status: doc._status } : {}),
        version: doc.updatedAt,
        ...current,
        ...localized,
      })
    },
  }

  const applyOperationsTool: BuilderMcpTool = {
    name: 'applyOperations',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Edits the draft layout of a document (a page, or a template: collection = the templates collection, id from listTemplates) with operations, applied in order, all or nothing. Saves a draft about a second later (never publishes). People with the page open see each change live.',
      'Operations: insert { block, to }, move { id, to }, remove { id }, duplicate { id, newId? }, update { id, props?, unsetProps?, className?, addClassName?, removeClassName?, hidden?, label?, bindings?, visibility?, motion?, attrs?, partClassName? }. update merges props and bindings (null removes a binding); className REPLACES all classes, while addClassName and removeClassName (space-separated) change single classes and keep the rest; visibility replaces all conditions; motion merges per kind, attrs per key, partClassName per part; null removes.',
      'Position { parentId (null = page root), slot? (default "children"), index }: index is the FINAL index in the target list (for a move in the same list, count after the block leaves). New ids: "b_" plus 6 lowercase letters or digits. Get current ids with getLayout. The block format, motion presets and visibility are in the listBlocks `guide`.',
      'Errors name the failing operation, and nothing is saved: wrong prop types, a block type a slot (or a slot further up) does not accept, a full slot (maxBlocks). The result lists `changes` (id, type, changed keys, the new className) and `warnings` for the blocks it touched: allowed in drafts but they block publishing (for example an empty required prop); "no-effect" warnings mark keys that do nothing there.',
      'Localized sites: with `locale`, update props write that locale\'s values of localized props; everything else changes every locale. Blocks inserted with `locale` hold their localized props in that locale only (the default locale stays empty until written). Without `locale`: the default locale.',
      NO_DIRECT_EDIT,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      operations: z.array(operationSchema).min(1).describe('Operations, applied in order.'),
      locale: localeArg,
    },
    handler: async (args, req) => {
      const collection = String(args.collection)
      const at = localeArgOf(req, collection, args.locale)
      if (typeof at === 'string') return fail(at)
      if (at.locale === 'all') return fail('`locale` "all" only reads. Write one locale at a time.')
      const ops = (args.operations as Record<string, unknown>[]).map((op) =>
        op.type === 'duplicate' && !op.newId ? { ...op, newId: createId() } : op,
      )
      // New blocks are written in the locale too: an AI that works in German writes German.
      // A root parentId models send as text ("__PAGE_ROOT__", "root") becomes null, as in insertSection.
      let before: Layout = { version: 1, blocks: [] }
      const result = await apply(req, collection, String(args.id), (layout) => {
        before = layout
        return stampLocale(repairRootParents(layout, ops as Operation[]).ops, at.locale, at.settings, { inserts: true })
      })
      if (!result.ok) return fail(result.error, result.errors)
      return text({
        ok: true,
        seq: result.seq,
        applied: result.ops.length,
        changedIds: [...touchedIds(result.ops)],
        changes: changeSummary(before, result.layout, result.ops),
        ...touchedWarnings(req, collection, result),
      })
    },
  }

  const validateLayoutTool: BuilderMcpTool = {
    name: 'validateLayout',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Checks a layout against the block schemas without saving. Pass `layout` (the JSON object) to check a layout you wrote, or only `id` to check the document\'s current draft. Returns `errors` (block a save) and `warnings` (allowed in drafts, but they block publishing: missing required props, values outside their limits, slots with fewer blocks than their minBlocks, messages from the validate functions of props; unknown props and "no-effect" keys, such as visibility on a normal page, never block).',
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
      let doc: Record<string, unknown> | null = null
      if (layout === undefined) {
        if (!args.id) return fail('Pass `layout` or `id`.')
        try {
          doc = await loadDraft(req, String(args.collection), String(args.id))
          layout = (await currentLayout(req, String(args.collection), doc)).layout
        } catch (error) {
          return fail(errorMessage(error))
        }
      }
      const localization = localizationOf(req, String(args.collection))
      const { blocking, warnings } = splitLayoutErrors(withoutBoundRequired(validateLayout(layout, blocks, { localization }), layout))
      // A Payload blocks field refuses what it cannot store (classes, animations, other block types).
      const codec = codecOf(builderConfigOf(req.payload)?.collections[String(args.collection)])
      if (blocking.length === 0) {
        for (const message of codec.problems(normalizeLayout(layout))) blocking.push({ path: '', message, code: 'invalid' })
      }
      // The props' own `validate` functions (publish only, so they are warnings), on a layout that
      // has the right shape.
      if (blocking.length === 0) {
        const collection = String(args.collection)
        const field = fieldOf(collection)
        const normalized = normalizeLayout(layout)
        warnings.push(
          ...(await runPropValidators(normalized, {
            blocks,
            registry: fieldRegistryOf(req.payload),
            ctx: {
              layoutField: field,
              req,
              collection: collectionConfig(req, collection) ?? null,
              operation: 'update',
              id: args.id === undefined ? undefined : String(args.id),
              data: { ...doc, [field]: normalized },
              overrideAccess: false,
            },
            localization,
          })),
        )
      }
      if (blocking.length === 0 && rendersWithoutDocument(req, String(args.collection))) warnings.push(...contextOnlyWarnings(normalizeLayout(layout)))
      return text({ valid: blocking.length === 0, errors: blocking, warnings })
    },
  }

  const getPreviewUrl: BuilderMcpTool = {
    name: 'getPreviewUrl',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Returns the links of a document: `url` (the public page), `previewUrl` (the draft preview, when the site has one) and `editorUrl` (the full-screen builder in the admin, where a person can watch your changes live). Give these links to the user.',
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

      const url = absolute(documentPath(options.collections[collection]?.url, doc))
      const previewUrl = absolute(await draftPreviewPath(req, collection, doc))
      const adminRoute = req.payload.config.routes?.admin ?? '/admin'
      return text({
        ...(url ? { url } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        editorUrl: `${site}${builderViewPath(adminRoute, collection, String(doc.id))}`,
        ...(doc._status ? { status: doc._status } : {}),
        ...(doc._status === 'draft' ? { note: 'Changes are saved as a draft. The public url shows them after publishing.' } : {}),
      })
    },
  }

  const mediaCollection = options.mediaCollection ?? 'media'
  const generateImage: BuilderMcpTool = {
    name: 'generateImage',
    routing: { kind: 'collection', action: 'create' },
    description: [
      `Generates a NEW image from a text prompt with the site's own image model and saves it in the media library ("${mediaCollection}"), with alt text. Use it when you cannot make images yourself: the site generates them. It costs the site money and takes 5 to 60 seconds, so first look for an existing image (findDocument or searchContent on "${mediaCollection}") when one could fit. Sites cap images per user per hour.`,
      'Write the prompt in English as a concrete visual description: subject, setting, light, mood, style ("studio photo", "flat vector illustration") and composition. Leave out text, letters and logos. Pick aspectRatio for the place: hero or banner 16:9 or 21:9, card 4:3 or 3:2, portrait 3:4, avatar or icon 1:1.',
      'Returns the media `id`, `url`, size and alt text. To show it on a page, set the id as the image prop of a block with applyOperations "update" (getBlockSchema shows the prop name; the default image block uses "image").',
    ].join('\n\n'),
    parameters: {
      collection: z.enum([mediaCollection]).default(mediaCollection).describe(`The upload collection. Always "${mediaCollection}" (may be left out).`),
      prompt: z.string().min(3).max(4000).describe('What the image shows, in detail.'),
      aspectRatio: z
        .enum(IMAGE_ASPECT_RATIOS as unknown as [string, ...string[]])
        .optional()
        .describe('Width:height. Default "1:1".'),
      alt: z.string().max(300).optional().describe('Short alt text for screen readers. Default: from the prompt.'),
    },
    handler: async (args, req, extra) => {
      const outcome = await generateImageToMedia(req, imageServiceOf(req.payload), {
        prompt: args.prompt,
        aspectRatio: args.aspectRatio,
        alt: args.alt,
        collection: args.collection,
        signal: (extra as { signal?: AbortSignal } | undefined)?.signal,
        source: 'mcp',
      })
      if (!outcome.ok) return fail(outcome.message)
      const { media } = outcome
      return text({
        ok: true,
        media: { id: media.id, collection: media.collection, url: media.url, alt: media.alt, width: media.width, height: media.height, filename: media.filename },
        model: outcome.model,
        seconds: outcome.seconds,
        ...(outcome.cost !== undefined ? { costUsd: outcome.cost } : {}),
        ...(outcome.revisedPrompt ? { revisedPrompt: outcome.revisedPrompt } : {}),
        imagesLeftThisHour: outcome.remainingThisHour,
        next: `Place it with applyOperations: {"type":"update","id":"<block id>","props":{"image":${JSON.stringify(media.id)}}}.`,
      })
    },
  }

  // Editable classes: listClasses, getClass, upsertClass, deleteClass.
  const classTools = options.classes === false ? [] : classMcpTools(options.classes)
  const tools = [listBlocks, getBlockSchema, listSections, insertSection, getLayout, applyOperationsTool, validateLayoutTool, getPreviewUrl, generateImage, ...classTools]
  if (!templatesSlug) return tools

  const listTemplates: BuilderMcpTool = {
    name: 'listTemplates',
    routing: { kind: 'collection', action: 'read' },
    description: [
      `Lists the templates: layouts that render every document of a collection (${templateTargets.join(', ')}). A document uses its own template (its "template" field), else the published template with the highest "${TEMPLATE_PRIORITY_FIELD}" whose "${TEMPLATE_CONDITIONS_FIELD}" (a Payload where query against the document, e.g. { "featured": { "equals": true } }) match it (equal priority: the older template), else its collection's default template.`,
      `To edit a template, call getLayout and applyOperations with collection "${templatesSlug}" and the template id. Bind props to the document's fields with "bindings" (getBindingSources lists the fields). To create a template, use createDocument on "${templatesSlug}" with { name, ${TEMPLATE_TARGET_FIELD}, ${TEMPLATE_DEFAULT_FIELD} } and optional ${TEMPLATE_CONDITIONS_FIELD} and ${TEMPLATE_PRIORITY_FIELD}.`,
    ].join('\n'),
    parameters: {
      collection: z.enum([templatesSlug]).default(templatesSlug).describe(`Always "${templatesSlug}" (may be left out).`),
      target: z.enum(templateTargets as [string, ...string[]]).optional().describe('Only templates for this collection.'),
    },
    handler: async (args, req) => {
      try {
        const result = await req.payload.find({
          collection: templatesSlug as never,
          where: args.target ? { [TEMPLATE_TARGET_FIELD]: { equals: args.target } } : {},
          depth: 0,
          limit: 200,
          draft: true,
          overrideAccess: false,
          user: req.user,
          req,
        })
        const adminRoute = req.payload.config.routes?.admin ?? '/admin'
        return text({
          collection: templatesSlug,
          templates: (result.docs as Record<string, unknown>[]).map((doc) => ({
            id: doc.id,
            name: doc.name,
            target: doc[TEMPLATE_TARGET_FIELD],
            isDefault: doc[TEMPLATE_DEFAULT_FIELD] === true,
            ...(templateConditions(doc) ? { conditions: templateConditions(doc) } : {}),
            ...(typeof doc[TEMPLATE_PRIORITY_FIELD] === 'number' && doc[TEMPLATE_PRIORITY_FIELD] !== 0 ? { priority: doc[TEMPLATE_PRIORITY_FIELD] } : {}),
            ...(doc[TEMPLATE_PREVIEW_FIELD] ? { previewDocument: doc[TEMPLATE_PREVIEW_FIELD] } : {}),
            ...(doc._status ? { status: doc._status } : {}),
            blocks: normalizeLayout(doc[TEMPLATE_LAYOUT_FIELD]).blocks.length,
            editorPath: builderViewPath(adminRoute, templatesSlug, String(doc.id)),
          })),
          next: 'getLayout to read a template. getBindingSources for the fields its blocks can bind to.',
        })
      } catch (error) {
        return fail(errorMessage(error))
      }
    },
  }

  const sourceSlugs = [...new Set([...templateTargets, ...listable])]
  const getBindingSources: BuilderMcpTool = {
    name: 'getBindingSources',
    routing: { kind: 'collection', action: 'read' },
    description: [
      'Lists the fields of a collection that block props can bind to, as dot paths (e.g. "title", "featuredImage", "author.name", "categories.title"). Relationship and upload fields include the related document\'s fields (one level).',
      'The result\'s `guide` explains bindings (paths, $url, $item, $index, $parent, $page, fallbacks, formatters, template strings) and VISIBILITY conditions. Both work only in templates and inside collection list or repeat items.',
    ].join('\n'),
    parameters: {
      collection: ((arg) => (sourceSlugs.length === 1 ? arg.default(sourceSlugs[0]!) : arg))(
        z.enum(sourceSlugs as [string, ...string[]]).describe(`A template target or a collection a list can show. One of: ${sourceSlugs.join(', ')}.`),
      ),
    },
    handler: async (args, req) => {
      const sources = templatesConfigOf(req.payload)?.sources[String(args.collection)]
      if (!sources) return fail(`No bindable fields for "${String(args.collection)}". Is websiteBuilder configured with templates?`)
      return text({ collection: args.collection, fields: sources, guide: BINDINGS_GUIDE })
    },
  }

  return [...tools, listTemplates, getBindingSources]
}

export { LAYOUT_GUIDE, sectionInsertOps, withNewIds }
export type { LiveActor }
