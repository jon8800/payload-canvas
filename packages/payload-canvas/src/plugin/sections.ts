// Saved sections: blocks people save from the editor ("Save as section…") to reuse on any page.
// A plugin-owned collection. The editor's library, the MCP tools and the AI assistant list them
// next to the app's built-in sections. Only type imports from `payload`: the editor imports the
// pure helpers below.

import type { Access, CollectionConfig, FieldHook, PayloadRequest, Validate } from 'payload'

import { hasPropHooks, runPropHooks, type FieldRunContext } from '../core/fieldHooks'
import type { FieldRegistry } from '../core/fieldSemantics'
import { runPropValidators } from '../core/fieldValidate'
import { describeLayoutErrors } from '../core/issues'
import { localeSettingsOf } from '../core/locale'
import { findSection, withoutSectionOrigin } from '../core/sections'
import { SAVED_SECTIONS_CONFIG_KEY, SECTION_REF_BLOCK, sectionRefId } from '../blocks/builtins/sectionRef'
import { isPlainObject, normalizeLayout } from '../core/tree'
import type { Block, BlockDefinition, Layout, LocaleSettings, SectionDefinition } from '../core/types'
import { isLayoutWarning, validateLayout } from '../core/validate'
import { splitLayoutErrors } from '../live/apply'
import { fieldRegistryOf } from '../live/fieldChecks'

export const DEFAULT_SAVED_SECTIONS_SLUG = 'builder-sections'

/** Server-only key in `config.custom`: `{ slug }` of the saved sections collection. */
export { SAVED_SECTIONS_CONFIG_KEY }

/** A saved section's id in section lists: `saved:<document id>`. */
export const SAVED_SECTION_PREFIX = 'saved:'

/** At most this many saved sections are listed (newest first). */
export const SAVED_SECTIONS_LIMIT = 200

const NAME_MAX = 120
const CATEGORY_MAX = 60

export type SavedSectionsOptions = {
  /** Slug of the collection. Default "builder-sections". */
  slug?: string
  /** Access control. Default: every signed-in user can read, create, update and delete. */
  access?: CollectionConfig['access']
  /** Merged into the collection's `admin` options (e.g. `group`, `hidden`). */
  admin?: CollectionConfig['admin']
  hooks?: CollectionConfig['hooks']
}

export type SavedSectionsServerConfig = { slug: string }

/** Reads the saved sections config the plugin stored on the Payload config. `null` when turned off. */
export function savedSectionsConfigOf(payload: { config: { custom?: Record<string, unknown> } }): SavedSectionsServerConfig | null {
  const value = payload.config.custom?.[SAVED_SECTIONS_CONFIG_KEY] as SavedSectionsServerConfig | undefined
  return value && typeof value.slug === 'string' ? value : null
}

export function savedSectionId(docId: string | number): string {
  return `${SAVED_SECTION_PREFIX}${docId}`
}

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max)
  return trimmed || undefined
}

/** A saved sections document as a section. Null when it has no id or no valid blocks. */
export function toSavedSection(doc: Record<string, unknown>): SectionDefinition | null {
  const id = doc.id
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const blocks = normalizeLayout({ version: 1, blocks: doc.blocks }).blocks
  if (blocks.length === 0) return null
  const category = text(doc.category, CATEGORY_MAX)
  return {
    id: savedSectionId(id),
    label: text(doc.name, NAME_MAX) ?? 'Untitled section',
    ...(category ? { category } : {}),
    blocks,
    savedId: id,
  }
}

/**
 * The data that saves `block` (with everything inside it) as a section. The blocks keep their
 * ids: every insert gives the copy new ids. An empty name falls back to `fallbackName`.
 */
export function savedSectionData(
  block: Block,
  name: string,
  category?: string | null,
  fallbackName = 'Untitled section',
): { name: string; category: string | null; blocks: Block[] } {
  return {
    name: text(name, NAME_MAX) ?? fallbackName,
    category: text(category, CATEGORY_MAX) ?? null,
    // A saved section has no variants: it forgets the app section it was inserted from.
    blocks: normalizeLayout({ version: 1, blocks: [withoutSectionOrigin(block)] }).blocks,
  }
}

/** Finds a section by id, saved document id or name (moved to core/sections.ts). */
export { findSection }

/** The saved sections the request's user can read, newest first. Empty when the read fails. */
export async function loadSavedSections(req: PayloadRequest, slug: string): Promise<SectionDefinition[]> {
  try {
    const result = await req.payload.find({
      collection: slug as never,
      depth: 0,
      limit: SAVED_SECTIONS_LIMIT,
      sort: '-createdAt',
      overrideAccess: false,
      user: req.user,
      req,
    })
    return (result.docs as unknown as Record<string, unknown>[]).flatMap((doc) => toSavedSection(doc) ?? [])
  } catch {
    return []
  }
}

/** The saved sections that `sectionRef` blocks in `blocks` point at (any depth), as text ids. */
export function sectionRefIds(blocks: unknown): string[] {
  const ids = new Set<string>()
  const visit = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const block of list) {
      if (!isPlainObject(block)) continue
      if (block.type === SECTION_REF_BLOCK) {
        const id = sectionRefId(isPlainObject(block.props) ? block.props.section : undefined)
        if (id !== null) ids.add(String(id))
      }
      if (isPlainObject(block.slots)) for (const children of Object.values(block.slots)) visit(children)
    }
  }
  visit(blocks)
  return [...ids]
}

/**
 * True when the blocks of saved section `self` would contain `self`: directly, or through the
 * components they contain (up to `maxDepth` levels). `load` gives the stored blocks of saved
 * sections by id (missing ones are left out).
 */
export async function containsSection(
  self: string,
  blocks: unknown,
  load: (ids: string[]) => Promise<Map<string, unknown>>,
  maxDepth = 5,
): Promise<boolean> {
  const seen = new Set<string>()
  let level = sectionRefIds(blocks)
  for (let depth = 0; depth < maxDepth && level.length > 0; depth++) {
    if (level.includes(self)) return true
    level.forEach((id) => seen.add(id))
    const loaded = await load(level)
    level = [...new Set([...loaded.values()].flatMap(sectionRefIds))].filter((id) => !seen.has(id) || id === self)
  }
  return level.includes(self)
}

/** Loads the stored blocks of saved sections, with the request's access. */
function sectionBlocksLoader(req: PayloadRequest, slug: string) {
  return async (ids: string[]): Promise<Map<string, unknown>> => {
    const result = await req.payload.find({
      collection: slug as never,
      where: { id: { in: ids } },
      depth: 0,
      limit: ids.length,
      pagination: false,
      req,
      overrideAccess: true,
    })
    return new Map((result.docs as unknown as Record<string, unknown>[]).map((doc) => [String(doc.id), doc.blocks]))
  }
}

const signedIn: Access = ({ req }) => Boolean(req.user)

/**
 * The builder's layout field on saved sections. Virtual: it reads `{ version: 1, blocks }` from the
 * stored `blocks`, and `syncSectionBlocks` (./sectionsBuilder.ts) writes the builder's layout back
 * to `blocks`. So the full-screen builder edits a section like a page, and every reader of
 * `blocks` stays as it is.
 */
export const SECTION_LAYOUT_FIELD = 'layout'


/**
 * Runs the field logic of block props on a section's blocks, as every layout save does
 * (plugin/hook.ts): `beforeValidate` hooks, then `beforeChange` hooks, in place. Then the props'
 * own `validate` functions and the publish-only problems (missing required props, values outside
 * their limits): a section is never published, so they come back as warnings and never block.
 */
export async function runSectionFieldLogic(
  layout: Layout,
  options: {
    blocks: readonly BlockDefinition[]
    registry: FieldRegistry
    ctx: FieldRunContext
    previous?: Layout | null
    localization?: LocaleSettings | null
  },
): Promise<{ warnings: string[] }> {
  const { blocks, registry, ctx, previous = null, localization = null } = options
  if (hasPropHooks(registry, 'beforeValidate') || hasPropHooks(registry, 'beforeChange')) {
    await runPropHooks('beforeValidate', layout, { blocks, registry, previous, ctx, localization })
    await runPropHooks('beforeChange', layout, { blocks, registry, previous, ctx, localization })
  }
  const { warnings } = splitLayoutErrors(validateLayout(layout, blocks as BlockDefinition[], { localization }))
  const problems = warnings.filter((error) => !isLayoutWarning(error))
  problems.push(...(await runPropValidators(layout, { blocks, registry, previous, ctx, localization })))
  return { warnings: describeLayoutErrors(layout, problems, blocks, { localization }).map((issue) => issue.message) }
}

/**
 * The `blocks` field's `beforeValidate` hook: canonical form, then the props' field hooks (the
 * stored section holds the same values a page save would store). Warnings go to the server log.
 */
function sectionBlocksHook(blocks: readonly BlockDefinition[], slug: string): FieldHook {
  return async ({ value, req, collection, context, operation, overrideAccess, data, originalDoc }) => {
    if (value === undefined || value === null) return value
    const layout = normalizeLayout({ version: 1, blocks: value })
    // A layout no renderer can trust is refused by the field's `validate`; hooks do not run on it.
    if (!Array.isArray(value) || splitLayoutErrors(validateLayout(layout, blocks as BlockDefinition[])).blocking.length > 0) return layout.blocks
    const before = isPlainObject(originalDoc) && Array.isArray(originalDoc.blocks) ? normalizeLayout({ version: 1, blocks: originalDoc.blocks }) : null
    const { warnings } = await runSectionFieldLogic(layout, {
      blocks,
      registry: fieldRegistryOf(req.payload),
      previous: before,
      localization: localeSettingsOf(req.payload.config.localization),
      ctx: {
        layoutField: 'blocks',
        req,
        collection,
        context,
        operation: operation === 'create' ? 'create' : 'update',
        overrideAccess,
        id: isPlainObject(originalDoc) ? (originalDoc.id as string | number | undefined) : undefined,
        data: { ...originalDoc, ...data, blocks: layout.blocks },
        originalDoc,
      },
    })
    if (warnings.length > 0) req.payload.logger.warn(`[websiteBuilder] ${slug}: section saved with problems:\n${warnings.map((w) => `  - ${w}`).join('\n')}`)
    return layout.blocks
  }
}

/** The saved sections collection. `blocks` are the app's block definitions (the layout is checked against them). */
export function savedSectionsCollection(args: { slug: string; blocks: BlockDefinition[]; options?: SavedSectionsOptions }): CollectionConfig {
  const { slug, blocks, options } = args
  return {
    slug,
    labels: { singular: 'Saved section', plural: 'Saved sections' },
    versions: false,
    authorship: false,
    access: {
      read: signedIn,
      create: signedIn,
      update: signedIn,
      delete: signedIn,
      ...options?.access,
    },
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'category', 'updatedAt'],
      description: 'Sections saved from the page builder with "Save as section…". The builder lists them in the Sections tab, under "Saved".',
      ...options?.admin,
    },
    defaultSort: '-createdAt',
    hooks: options?.hooks,
    fields: [
      { name: 'name', type: 'text', required: true, maxLength: NAME_MAX },
      {
        name: 'category',
        type: 'text',
        maxLength: CATEGORY_MAX,
        admin: { description: 'Optional, e.g. "Heroes" or "Pricing". Search in the library finds it.' },
      },
      {
        name: 'blocks',
        type: 'json',
        required: true,
        admin: {
          // The builder edits them (the Builder tab). An old copy in this form must not win over it.
          readOnly: true,
          description: 'The section\'s blocks. Edit them in the builder: open the Builder tab. Pages that inserted this section keep their own copy.',
        },
        hooks: {
          // Canonical form, like every layout (no empty slots or props), and the props' field hooks.
          beforeValidate: [sectionBlocksHook(blocks, slug)],
        },
        validate: (async (value: unknown, { id, req }: { id?: string | number; req: PayloadRequest }) => {
          if (!Array.isArray(value) || value.length === 0) return 'A section needs at least one block.'
          const { blocking } = splitLayoutErrors(validateLayout({ version: 1, blocks: value }, blocks))
          if (blocking.length > 0) return blocking.slice(0, 3).map((e) => e.message).join(' ')
          if (id !== undefined && (await containsSection(String(id), value, sectionBlocksLoader(req, slug)))) {
            return 'A component cannot contain itself. Remove the copy of this component from its own blocks.'
          }
          return true
        }) as Validate,
      },
      {
        // The builder's layout (see SECTION_LAYOUT_FIELD). No database column.
        name: SECTION_LAYOUT_FIELD,
        type: 'json',
        virtual: true,
        hooks: {
          afterRead: [
            ({ siblingData, value }) =>
              isPlainObject(value) ? value : { version: 1, blocks: Array.isArray(siblingData?.blocks) ? siblingData.blocks : [] },
          ],
        },
      },
    ],
  }
}
