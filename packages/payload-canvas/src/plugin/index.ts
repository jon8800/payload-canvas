import path from 'node:path'
import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
  Config,
  Field,
  JSONField,
  Payload,
  PayloadRequest,
  Plugin,
  RichTextField,
} from 'payload'
import { AI_PATH, aiEndpoints } from '../ai/endpoint'
import { aiClientConfig } from '../ai/config'
import { AI_IMAGES_KEY, createImageService } from '../ai/images/service'
import type { AiOptions } from '../ai/types'
import { defaultBlocks } from '../blocks'
import { richTextFieldName } from '../core/blocks'
import { DEFAULT_TEMPLATES_SLUG, DOCUMENT_TEMPLATE_FIELD, TEMPLATE_TARGET_FIELD } from '../core/bindings'
import { localeSettingsOf } from '../core/locale'
import { resolveRegions, type RegionOption } from '../core/regions'
import { decodePayloadBlocks, payloadBlocksProblems, payloadBlocksStorage, type PayloadBlocksStorage } from '../core/payloadBlocks'
import {
  EMPTY_LAYOUT,
  type BlockDefinition,
  type BuilderClientConfig,
  type EditorOptions,
  type LocaleSettings,
  type RegionConfig,
  type SectionDefinition,
  type TemplatesClientConfig,
} from '../core/types'
import { applyFontFamilies, getCanvasCssInput, getStyleTokens, type CssOptions, type FontFamilies, type TailwindPlugins } from '../css'
import { DEFAULT_THEME_SLUG, THEME_CONFIG_KEY, THEME_PATH, type ThemeOptions, type ThemeServerConfig } from '../theme/config'
import { themeFontFamilies, themeOutput, type ThemeData } from '../theme/css'
import { themeGlobal } from '../theme/global'
import {
  BUILDER_CONFIG_KEY,
  defaultLiveRuntime,
  documentEndpoints,
  installShutdownFlush,
  LIVE_PATH,
  LIVE_RUNTIME_KEY,
  liveEndpoints,
  type BuilderCollectionServer,
  type BuilderServerConfig,
  type SessionManager,
} from '../live'
import { captureFieldSemantics, type FieldRegistry } from '../core/fieldSemantics'
import { FIELD_REGISTRY_KEY } from '../live/fieldChecks'
import { regionEndpoints } from '../live/regions'
import { defaultWriteGate, installLocalApiBoundary, installTransactionSignals, withGateSignals, type WriteGate } from '../live/writeGate'
import {
  keepLockBeforeOperation,
  layoutAfterChange,
  payloadBlocksAfterChange,
  payloadBlocksBeforeChange,
  layoutAfterRead,
  layoutBeforeChange,
  recordOverrideAccess,
  type BindingCheck,
} from './hook'
import {
  DEFAULT_SAVED_SECTIONS_SLUG,
  SAVED_SECTIONS_CONFIG_KEY,
  savedSectionsCollection,
  SECTION_LAYOUT_FIELD,
  type SavedSectionsOptions,
  type SavedSectionsServerConfig,
} from './sections'
import { syncSectionBlocks } from './sectionsBuilder'
import { toJsonSafe } from './jsonSafe'
import { collectionLabel } from './labels'
import { listCollectionsOf } from './listCollections'
import { addReferences, REFERENCES_CONFIG_KEY, resolveReferences, type ReferencesOptions } from './references'
import {
  bindingSources,
  documentTemplateField,
  hasFieldNamed,
  requireBlocksForDefault,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATES_CONFIG_KEY,
  templatesCollection,
} from './templates'

export type { GeneratedCss } from './hook'
export type { SavedSectionsOptions } from './sections'
export type { ReferencesOptions } from './references'

/**
 * Server-only key in `config.custom`: what the site needs to compile one stylesheet for every
 * layout on a page (`compilePageCss` in `payload-canvas/react/server`).
 */
export const SITE_CSS_KEY = 'websiteBuilderCss'

/** The value under `SITE_CSS_KEY`. */
export type SiteCssConfig = { css: CssOptions; blocks: BlockDefinition[] }

/** Reads the site CSS config the plugin stored on the Payload config. `null` without the plugin. */
export function siteCssConfigOf(payload: { config: { custom?: Record<string, unknown> } }): SiteCssConfig | null {
  const value = payload.config.custom?.[SITE_CSS_KEY] as SiteCssConfig | undefined
  return value?.css && Array.isArray(value.blocks) ? value : null
}

export type BuilderCollectionOptions = {
  /**
   * Name of the builder's field. Default "layout". The field's own type says how the layout is
   * stored:
   * - a Payload `blocks` field of the collection: the builder edits that field itself, the one
   *   source of truth. Payload's editor, hooks, validation, access and versions keep working on it;
   *   the builder offers only its block types (from `fromPayloadBlocks`) and keeps nothing the field
   *   cannot hold (no Tailwind classes, animations, bindings, hidden blocks; translations in
   *   Payload's editor).
   * - a `json` field, or no field with that name: the builder's own JSON layout, with every feature.
   */
  field?: string
  /**
   * Frontend path of a document. Used for preview. Collections with a `url` can be shown by the
   * collection list block.
   */
  url?: (doc: Record<string, unknown>) => string
  /**
   * Documents render through templates: the plugin adds the templates collection and a `template`
   * relationship (sidebar) to this collection. The site loads the template with `loadTemplate`
   * from `payload-canvas/react/server`.
   */
  templates?: boolean
  /**
   * Top-level fields the builder replaced but the collection still has, for example the old
   * `blocks` field after `migrateBlocksField`. Publish in the builder keeps their published value,
   * so only the builder content goes live. Without it, Publish publishes the old field's latest
   * draft too. Remove the names when you remove the fields.
   */
  legacyFields?: string[]
  /**
   * Fixed parts of the page that show ordinary document fields outside the layout, for example a
   * header made of `title`, `subtitle` and `coverImage`. The fields stay where they are; the
   * builder shows the whole page through the app's page frame (`createCanvasServer({ frame })`)
   * and lets editors edit these fields on the canvas and in the settings drawer. A region is
   * never dragged, duplicated or deleted. Paths go through groups and named tabs ("header.title");
   * fields in rows, collapsibles and unnamed tabs are named directly. Left out: the builder shows
   * the layout alone. See the README's "Whole-page editing" section.
   */
  regions?: RegionOption[]
  /**
   * How the layout is translated when Payload's `localization` is on. `'props'` (the default):
   * one layout structure for every locale; props whose field says `localized: true` hold a value
   * per locale. `false`: the layout is not translated (one set of values for every locale).
   * A separate layout per locale (`localized: true` on the whole field) is not supported yet.
   */
  localization?: 'props' | false
}

export type TemplatesOptions = {
  /** Slug of the templates collection. Default "builder-templates". */
  slug?: string
  /** Hooks for the templates collection, e.g. `afterChange` to revalidate the pages that use templates. */
  hooks?: CollectionConfig['hooks']
  /** `false`: template layouts are not translated. Default: as the collections (`'props'`). */
  localization?: 'props' | false
}

export type { FontFamilies }

export type WebsiteBuilderOptions = {
  collections: Record<string, BuilderCollectionOptions>
  /** Default: defaultBlocks(). */
  blocks?: BlockDefinition[]
  css: {
    /** Path to the app's Tailwind entry CSS, absolute or relative to process.cwd(). */
    entry: string
    plugins?: TailwindPlugins
    /**
     * The font families the site really uses, by font variable name (`sans`, `heading`, `mono`, …).
     * The plugin's theme global already supplies its fonts; use this only for fonts set at runtime
     * some other way. Its names win over the theme's. Names left out keep `var(--font-<name>)`.
     */
    fontFamilies?: (payload: Payload) => FontFamilies | Promise<FontFamilies>
  }
  /** Frontend route that renders the canvas iframe. Default "/builder-canvas". */
  canvasPath?: string
  /** Ready-made sections shown in the editor's library and offered to AI tools. */
  sections?: SectionDefinition[]
  /**
   * Sections people save from the editor ("Save as section…" in a block's menu). The plugin adds
   * a collection for them (slug "builder-sections"); the library lists them under "Saved", and the
   * MCP tools and the AI assistant can insert them. On by default; `false` turns it off.
   */
  savedSections?: SavedSectionsOptions | false
  /**
   * Live editing: every open editor and every AI agent (MCP) edits one shared in-memory session
   * per document, and the server saves its draft about a second after the last change. Sessions
   * live in one app server process: with several servers, route each document to one server.
   */
  live?: { heartbeatMs?: number }
  /**
   * @deprecated Has no effect. Several people can always edit a layout at once. Payload's
   * document locking stays on for the other fields (Edit view, settings drawer); the builder view
   * never takes the lock. Set `lockDocuments: false` on a collection to turn the lock off.
   */
  multiplayer?: boolean
  /** Options for the templates collection. It exists when a collection sets `templates: true`. */
  templates?: TemplatesOptions
  /**
   * The AI assistant in the editor. Presence enables it. `ai.adapter` connects it to a model API,
   * e.g. `openRouterAdapter()` from `payload-canvas/ai/openrouter`. Without an adapter
   * the panel shows the setup card. See docs/ai/providers.md.
   */
  ai?: AiOptions
  /**
   * The theme global (colors, fonts, radius, spacing) with color, font and slider pickers. On by
   * default; `false` leaves it out. Render it on the site with `ThemeStyle` from
   * `payload-canvas/react/server`. See the README's "Theme" section.
   */
  theme?: ThemeOptions | false
  /** Editor behaviour, e.g. `{ dragMode: 'smooth' }`. See the README's "Drag and drop" section. */
  editor?: EditorOptions
  /**
   * References: a hidden `builderRefs` field on every builder collection lists the media and
   * documents its layout uses. Upload collections the blocks use (e.g. media) get a "Used in" list
   * and refuse to delete documents that are still used. On by default; `false` turns it off. See
   * the README's "References and Used in" section.
   */
  references?: ReferencesOptions | false
}

const LAYOUT_FIELD_COMPONENT = 'payload-canvas/client#LayoutField'
const BUILDER_TAB_COMPONENT = 'payload-canvas/client#BuilderTab'
const PUBLISH_BUTTON_COMPONENT = 'payload-canvas/client#PublishButton'
const BUILDER_VIEW_COMPONENT = 'payload-canvas/rsc#BuilderView'
const BUILDER_REDIRECT_COMPONENT = 'payload-canvas/rsc#BuilderRedirect'
const LAYOUT_DIFF_COMPONENT = 'payload-canvas/rsc#LayoutDiff'
const NO_DIFF_COMPONENT = 'payload-canvas/rsc#NoDiff'
/** Key of the full-screen builder view in `admin.components.views`. */
export const BUILDER_VIEW_KEY = 'websiteBuilder'
/** Path of the full-screen builder view below the admin route. */
export const BUILDER_VIEW_PATH = '/builder/:collection/:id'
const CANVAS_CSS_PATH = '/builder/canvas-css'
const STYLE_TOKENS_PATH = '/builder/style-tokens'

/** Name of the hidden field that stores the generated CSS (`{ hash, css }`) for a layout field. */
export function cssFieldName(field: string): string {
  return `${field}Css`
}

/**
 * The website builder plugin. Put it LAST in `plugins`: plugins such as SEO with `tabbedUI`
 * move all fields into tabs, and the layout field must stay a top-level field.
 *
 * Editors open the builder full screen at `{admin}/builder/:collection/:id` (a root admin view
 * without Payload's nav and header). The document's "Builder" tab and the layout field link there.
 */
export function websiteBuilder(options: WebsiteBuilderOptions): Plugin {
  return (config: Config): Config => {
    const apiRoute = config.routes?.api ?? '/api'
    const canvasPath = options.canvasPath ?? '/builder-canvas'
    const sourceCollections = config.collections ?? []
    const live = defaultLiveRuntime()
    const writeGate = defaultWriteGate()
    // Payload's locales. Each builder collection uses them unless it sets `localization: false`.
    const locales = localeSettingsOf(config.localization)
    // Collections whose builder field is their own Payload blocks field (filled below).
    const blocksStorageOf: Record<string, PayloadBlocksStorage> = {}
    const localizationOf = (slug: string): LocaleSettings | null => {
      // A Payload blocks field: the builder edits the default locale; Payload's editor the others.
      if (blocksStorageOf[slug]) return null
      const option = builderOptions[slug]?.localization
      if (option !== undefined && option !== false && option !== 'props') {
        throw new Error(`[websiteBuilder] \`localization\` of "${slug}" must be 'props' or false. A separate layout per locale is not supported yet.`)
      }
      return option === false ? null : locales
    }

    for (const slug of Object.keys(options.collections)) {
      if (!sourceCollections.some((c) => c.slug === slug)) {
        throw new Error(
          `[websiteBuilder] Collection "${slug}" does not exist. Known collections: ${sourceCollections.map((c) => c.slug).join(', ')}.`,
        )
      }
    }

    // Theme: a global with design tokens, rendered by ThemeStyle (`payload-canvas/react/server`) and the canvas.
    const themeOptions = options.theme === false ? null : (options.theme ?? {})
    const theme: ThemeServerConfig | null = themeOptions
      ? {
          slug: themeOptions.slug ?? DEFAULT_THEME_SLUG,
          cacheTag: themeOptions.cacheTag ?? themeOptions.slug ?? DEFAULT_THEME_SLUG,
          endpoint: `${apiRoute}${THEME_PATH}`,
        }
      : null
    if (theme && (config.globals ?? []).some((g) => g.slug === theme.slug)) {
      throw new Error(
        `[websiteBuilder] A global named "${theme.slug}" already exists. Remove it (the plugin adds the theme global), set \`theme.slug\` to another name, or set \`theme: false\`.`,
      )
    }
    /** The theme's font families for the Styles panel. Empty without a theme or when the read fails. */
    const themeFamilies = async (payload: Payload): Promise<FontFamilies> => {
      if (!theme) return {}
      const doc = await payload.findGlobal({ slug: theme.slug as never, depth: 0 }).catch(() => null)
      return themeFontFamilies(doc as ThemeData | null)
    }

    // Templates: a collection of layouts for the template-enabled collections.
    const targets = Object.entries(options.collections).filter(([, o]) => o.templates).map(([slug]) => slug)
    const templatesSlug = options.templates?.slug ?? DEFAULT_TEMPLATES_SLUG
    const withUrl = new Set(Object.entries(options.collections).filter(([, o]) => o.url).map(([slug]) => slug))
    const builderOptions: Record<string, BuilderCollectionOptions> = { ...options.collections }
    let collections = sourceCollections
    if (targets.length > 0) {
      if (sourceCollections.some((c) => c.slug === templatesSlug)) {
        throw new Error(
          `[websiteBuilder] A collection named "${templatesSlug}" already exists. Set \`templates.slug\` to another name.`,
        )
      }
      for (const slug of targets) {
        const target = sourceCollections.find((c) => c.slug === slug)
        if (target && hasFieldNamed(target.fields, DOCUMENT_TEMPLATE_FIELD)) {
          throw new Error(
            `[websiteBuilder] Collection "${slug}" already has a field named "${DOCUMENT_TEMPLATE_FIELD}". The plugin needs this name for the document's template.`,
          )
        }
      }
      collections = [
        ...sourceCollections.map((c) =>
          targets.includes(c.slug) ? { ...c, fields: [...c.fields, documentTemplateField(c.slug, templatesSlug)] } : c,
        ),
        templatesCollection({
          slug: templatesSlug,
          targets,
          targetLabels: Object.fromEntries(
            sourceCollections.filter((c) => targets.includes(c.slug)).map((c) => [c.slug, collectionLabel(c)]),
          ),
          hooks: options.templates?.hooks,
        }),
      ]
      builderOptions[templatesSlug] = { field: TEMPLATE_LAYOUT_FIELD, ...(options.templates?.localization === false ? { localization: false } : {}) }
    }

    const blocks = listCollectionsOf(options.blocks ?? defaultBlocks(), [...withUrl])
    const duplicate = blocks.find((b, i) => blocks.findIndex((other) => other.type === b.type) !== i)
    if (duplicate) {
      throw new Error(
        `[websiteBuilder] Two blocks have the type "${duplicate.type}". Every block type must be unique. For blocks made with fromPayloadBlocks(), set \`prefix\` (for example \`prefix: 'site'\` makes "${duplicate.type}" "site${duplicate.type.charAt(0).toUpperCase()}${duplicate.type.slice(1)}").`,
      )
    }
    // The props' validate, hooks and access, read now: Payload's config sanitizing later adds its
    // default validators and editor hooks to the same field objects (core/fieldSemantics.ts).
    const fieldRegistry = captureFieldSemantics(blocks)
    for (const [slug, o] of Object.entries(options.collections)) {
      for (const name of o.legacyFields ?? []) {
        const source = sourceCollections.find((c) => c.slug === slug)
        if (name === (o.field ?? 'layout') || !source || !hasFieldNamed(source.fields, name)) {
          throw new Error(
            `[websiteBuilder] \`legacyFields\` of "${slug}" names "${name}", which is ${name === (o.field ?? 'layout') ? 'the builder field itself' : 'not a field of the collection'}. List the old fields the builder replaced.`,
          )
        }
      }
    }

    // A builder field that is the collection's own Payload blocks field stays the source of truth.
    for (const [slug, o] of Object.entries(options.collections)) {
      const source = sourceCollections.find((c) => c.slug === slug)
      const field = o.field ?? 'layout'
      const found = source ? takeField(source.fields, field).found : undefined
      if (found?.type !== 'blocks') continue
      if (o.templates) {
        throw new Error(
          `[websiteBuilder] "${slug}.${field}" is a Payload blocks field, and templates hold builder JSON layouts. Leave out \`templates\` for "${slug}", or use a json field.`,
        )
      }
      const slugs = [
        ...(found.blocks ?? []).map((b) => (typeof b === 'string' ? b : b.slug)),
        ...((found as { blockReferences?: Array<string | { slug: string }> }).blockReferences ?? []).map((b) => (typeof b === 'string' ? b : b.slug)),
      ]
      blocksStorageOf[slug] = payloadBlocksStorage([...new Set(slugs)], blocks, `"${slug}.${field}"`)
    }

    // Saved sections: a collection of sections people saved from the editor.
    const savedSections: SavedSectionsServerConfig | null =
      options.savedSections === false ? null : { slug: options.savedSections?.slug ?? DEFAULT_SAVED_SECTIONS_SLUG }
    if (savedSections) {
      if (collections.some((c) => c.slug === savedSections.slug)) {
        throw new Error(
          `[websiteBuilder] A collection named "${savedSections.slug}" already exists. Set \`savedSections.slug\` to another name, or \`savedSections: false\`.`,
        )
      }
      collections = [
        ...collections,
        savedSectionsCollection({ slug: savedSections.slug, blocks, options: options.savedSections || undefined }),
      ]
      // The full-screen builder edits saved sections like pages (no drafts: changes save at once).
      builderOptions[savedSections.slug] = { field: SECTION_LAYOUT_FIELD }
    }
    // References: which media and documents each layout uses ("Used in", delete protection).
    const references = resolveReferences({
      options: options.references,
      collections,
      blocks,
      sources: {
        ...Object.fromEntries(
          Object.entries(builderOptions).map(([slug, o]) => {
            const storage = blocksStorageOf[slug]
            if (!storage) return [slug, { layout: o.field ?? 'layout' }]
            // The references index follows the blocks field itself (no copy of the content).
            const decode = (value: unknown) => {
              const result = decodePayloadBlocks(value, storage)
              return result.ok ? result.layout : undefined
            }
            return [slug, { layout: o.field ?? 'layout', decode }]
          }),
        ),
        ...(savedSections ? { [savedSections.slug]: { layout: 'blocks', blocksOnly: true } } : {}),
      },
    })
    // Page regions: document fields outside the layout that the builder shows and edits.
    const regionsOf: Record<string, RegionConfig[]> = {}
    for (const [slug, o] of Object.entries(options.collections)) {
      if (!o.regions) continue
      if (!Array.isArray(o.regions)) throw new Error(`[websiteBuilder] \`regions\` of "${slug}" must be a list.`)
      if (o.regions.length === 0) continue
      const source = sourceCollections.find((c) => c.slug === slug)
      const field = o.field ?? 'layout'
      const own = [field, cssFieldName(field), richTextFieldName(field), DOCUMENT_TEMPLATE_FIELD, ...(references ? [references.field] : [])]
      regionsOf[slug] = resolveRegions(slug, source?.fields ?? [], o.regions, { fields: new Set(own), legacy: new Set(o.legacyFields ?? []) })
    }
    const clientBlocks = toJsonSafe(blocks)
    const css: CssOptions = {
      entry: path.resolve(process.cwd(), options.css.entry),
      plugins: options.css.plugins,
    }
    const liveCollections: Record<string, BuilderCollectionServer> = Object.fromEntries(
      Object.entries(builderOptions).map(([slug, o]) => [
        slug,
        {
          field: o.field ?? 'layout',
          ...(o.url ? { url: o.url } : {}),
          ...(o.legacyFields?.length ? { legacyFields: o.legacyFields } : {}),
          localization: localizationOf(slug),
          ...(regionsOf[slug] ? { regions: regionsOf[slug] } : {}),
          ...(blocksStorageOf[slug] ? { payloadBlocks: blocksStorageOf[slug] } : {}),
        },
      ]),
    )
    const serverConfig: BuilderServerConfig = { collections: liveCollections, templates: targets.length > 0 ? templatesSlug : null }
    const views = config.admin?.components?.views
    if (views?.[BUILDER_VIEW_KEY]) {
      throw new Error(`[websiteBuilder] An admin view named "${BUILDER_VIEW_KEY}" already exists. The plugin needs this name for the builder view.`)
    }

    // Bindable fields of every template target and every collection the list block can show.
    // The plugin's own fields are left out.
    const templates: TemplatesClientConfig | null =
      targets.length > 0
        ? {
            collection: templatesSlug,
            sources: bindingSources({
              collections: collections.filter((c) => c.slug !== templatesSlug),
              slugs: [...new Set([...targets, ...withUrl])],
              skip: Object.fromEntries(
                Object.entries(builderOptions).map(([slug, o]) => {
                  const field = o.field ?? 'layout'
                  const plugin = [field, cssFieldName(field), richTextFieldName(field), DOCUMENT_TEMPLATE_FIELD]
                  return [slug, new Set(references ? [...plugin, references.field] : plugin)]
                }),
              ),
              withUrl,
            }),
          }
        : null
    const clientTemplates = templates ? toJsonSafe(templates) : null
    // Bindings are checked against the data model: a template's root reads its target collection.
    const bindingCheck = (slug: string): BindingCheck | undefined =>
      templates
        ? {
            sources: templates.sources,
            collectionOf: (doc) => {
              if (slug !== templatesSlug) return null
              const target = doc[TEMPLATE_TARGET_FIELD]
              return typeof target === 'string' ? target : null
            },
          }
        : undefined

    const fieldNames: Record<string, string> = {}
    // Image generation: one service (and one hourly limit) for the assistant, the editor and the MCP tools.
    const imageService = options.ai ? createImageService(options.ai) : null

    return {
      ...config,
      // The write gate hears of every commit, rollback and failed Local API save from the first one
      // on, also without onInit (`payload migrate`) and in migrations on connect (live/writeGate.ts).
      ...(config.db ? { db: withGateSignals(config.db, writeGate) } : {}),
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: {
            ...views,
            // Root views with three path segments render without Payload's nav and header.
            [BUILDER_VIEW_KEY]: { Component: BUILDER_VIEW_COMPONENT, path: BUILDER_VIEW_PATH, meta: { title: 'Builder' } },
          },
        },
      },
      collections: collections.map((collection) => {
        const collectionOptions = builderOptions[collection.slug]
        if (!collectionOptions) return references ? addReferences(collection, references) : collection
        const field = collectionOptions.field ?? 'layout'
        fieldNames[collection.slug] = field
        const storage = blocksStorageOf[collection.slug]
        const clientConfig: BuilderClientConfig = {
          collection: collection.slug,
          field,
          // A Payload blocks field offers its own block types only.
          // Its blocks have no style controls there: a Payload block stores no classes or animations,
          // also when the definition turns styles on for the builder's JSON layouts.
          blocks: storage ? toJsonSafe(storage.blocks.map(withoutStyles)) : clientBlocks,
          canvasPath,
          cssEndpoint: `${apiRoute}${CANVAS_CSS_PATH}`,
          tokensEndpoint: `${apiRoute}${STYLE_TOKENS_PATH}`,
          // Only sections the field can store as they are.
          sections: storage
            ? (options.sections ?? []).filter((section) => payloadBlocksProblems({ version: 1, blocks: section.blocks }, storage).length === 0)
            : (options.sections ?? []),
          liveEndpoint: `${apiRoute}${LIVE_PATH}`,
          templates: clientTemplates,
          ai: options.ai ? aiClientConfig(options.ai, `${apiRoute}${AI_PATH}`) : null,
          savedSections: savedSections ? { collection: savedSections.slug } : null,
          themeEndpoint: theme ? theme.endpoint : null,
          editor: { dragMode: options.editor?.dragMode ?? 'indicator' },
          validateTypes: [...fieldRegistry.types('validate')],
          localization: localizationOf(collection.slug),
          ...(regionsOf[collection.slug] ? { regions: toJsonSafe(regionsOf[collection.slug]) } : {}),
          ...(storage ? { storage: 'payload-blocks' as const, payloadRootTypes: [...storage.rootTypes] } : {}),
        }
        const isSections = collection.slug === savedSections?.slug
        const built = addBuilder(collection, {
          field,
          clientConfig,
          blocks,
          css,
          sessions: live.sessions,
          bindings: bindingCheck(collection.slug),
          // Runs after the layout hook, so it sees the live session's layout.
          afterLayout: collection.slug === templatesSlug && targets.length > 0 ? [requireBlocksForDefault] : isSections ? [syncSectionBlocks] : [],
          // A saved section's `blocks` follow its layout, which the live session protects.
          ownFields: [...(references ? [references.field] : []), ...(isSections ? ['blocks'] : [])],
          fieldRegistry,
          localization: localizationOf(collection.slug),
          writeGate,
          payloadBlocks: storage,
        })
        // After the layout hook, so the references follow the layout the session guard put in.
        return references ? addReferences(built, references) : built
      }),
      // Server-only: the MCP tools read the live runtime from here, so they share the bus and lock.
      custom: {
        ...config.custom,
        [LIVE_RUNTIME_KEY]: live,
        [FIELD_REGISTRY_KEY]: fieldRegistry,
        [BUILDER_CONFIG_KEY]: serverConfig,
        [SITE_CSS_KEY]: { css, blocks } satisfies SiteCssConfig,
        ...(templates ? { [TEMPLATES_CONFIG_KEY]: templates } : {}),
        ...(theme ? { [THEME_CONFIG_KEY]: theme } : {}),
        ...(savedSections ? { [SAVED_SECTIONS_CONFIG_KEY]: savedSections } : {}),
        ...(references ? { [REFERENCES_CONFIG_KEY]: references } : {}),
        ...(imageService ? { [AI_IMAGES_KEY]: imageService } : {}),
      },
      globals: themeOptions ? [...(config.globals ?? []), themeGlobal(themeOptions)] : config.globals,
      // A failed GraphQL or REST request ends its builder saves without a transaction (live/writeGate.ts).
      hooks: {
        ...config.hooks,
        afterError: [...(config.hooks?.afterError ?? []), ({ req }) => writeGate.failRequest(req)],
      },
      endpoints: [
        ...(config.endpoints ?? []),
        ...liveEndpoints({ collections: liveCollections, blocks, runtime: live, heartbeatMs: options.live?.heartbeatMs, fieldRegistry }),
        // Region fields: only when a collection has regions.
        ...(Object.keys(regionsOf).length > 0 ? regionEndpoints({ collections: liveCollections, runtime: live, gate: writeGate }) : []),
        ...documentEndpoints({
          collections: liveCollections,
          templates: serverConfig.templates,
          sections: savedSections?.slug ?? null,
          runtime: live,
          // The publish check uses the same binding rules as the save hook of each collection.
          check: { blocks, bindings: bindingCheck(templatesSlug), fieldRegistry },
        }),
        ...(options.ai
          ? aiEndpoints({
              ai: options.ai,
              images: imageService ?? undefined,
              collections: liveCollections,
              blocks,
              sections: options.sections ?? [],
              savedSections,
              getTokens: () => getStyleTokens(css),
              templates: templates ? { slug: templatesSlug, sources: templates.sources } : null,
            })
          : []),
        {
          path: CANVAS_CSS_PATH,
          method: 'get',
          handler: async (req) => {
            if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
            const input = await getCanvasCssInput(css)
            return Response.json(input, { headers: { 'Cache-Control': 'private, max-age=60' } })
          },
        },
        {
          path: STYLE_TOKENS_PATH,
          method: 'get',
          handler: async (req) => {
            if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
            const tokens = await getStyleTokens(css)
            const custom = await Promise.resolve(options.css.fontFamilies?.(req.payload)).catch(() => undefined)
            const families = { ...(await themeFamilies(req.payload)), ...custom }
            const fonts = applyFontFamilies(tokens.fonts, families)
            // Not cached by the browser: the fonts follow the theme global.
            return Response.json({ ...tokens, fonts }, { headers: { 'Cache-Control': 'private, no-cache' } })
          },
        },
        ...(theme
          ? [
              {
                // The theme as CSS and a Google Fonts URL, for ThemeLive in the canvas. Read access applies.
                path: THEME_PATH,
                method: 'get' as const,
                handler: async (req: PayloadRequest) => {
                  const doc = await req.payload.findGlobal({ slug: theme.slug as never, depth: 0, req, overrideAccess: false }).catch(() => null)
                  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 })
                  return Response.json(themeOutput(doc as ThemeData), { headers: { 'Cache-Control': 'no-store' } })
                },
              },
            ]
          : []),
      ],
      onInit: async (payload) => {
        // The adapter's init already did this (withGateSignals); again here for a `db` that came
        // in some other way. Before the app's own onInit saves anything: the write gate learns
        // from the adapter itself when a transaction committed or rolled back…
        installTransactionSignals(payload.db as never, writeGate)
        // …and when a Local API update ended, also a failed one without a transaction.
        installLocalApiBoundary(payload as never, writeGate)
        await config.onInit?.(payload)
        // Save unsaved live edits when the server stops.
        installShutdownFlush(live.sessions)
        for (const [slug, field] of Object.entries(fieldNames)) {
          // A Payload blocks field stays where the collection put it.
          if (blocksStorageOf[slug]) continue
          const collection = payload.config.collections.find((c) => c.slug === slug)
          const topLevel = collection?.fields.some((f) => 'name' in f && f.name === field)
          if (topLevel) continue
          payload.logger.error(
            `[websiteBuilder] The "${field}" field of "${slug}" is no longer a top-level field. A plugin listed after websiteBuilder moved it (for example SEO with tabbedUI). Put websiteBuilder last in "plugins".`,
          )
        }
      },
    }
  }
}

type EditViews = Extract<
  NonNullable<
    NonNullable<NonNullable<NonNullable<CollectionConfig['admin']>['components']>['views']>['edit']
  >,
  { root?: never }
>

type AddBuilderArgs = {
  field: string
  clientConfig: BuilderClientConfig
  blocks: BlockDefinition[]
  css: CssOptions
  sessions: SessionManager
  bindings?: BindingCheck
  /** beforeChange hooks that run after the layout hook. */
  afterLayout?: CollectionBeforeChangeHook[]
  /** More server-owned fields the stale-save check leaves out (the references field). */
  ownFields?: readonly string[]
  /** The props' validate, hooks and access. */
  fieldRegistry: FieldRegistry
  /** The locales of localized props, or null. */
  localization: LocaleSettings | null
  /** One save at a time per document. */
  writeGate: WriteGate
  /** The builder field is the collection's own Payload blocks field: its block types. */
  payloadBlocks?: PayloadBlocksStorage
}

function addBuilder(collection: CollectionConfig, args: AddBuilderArgs): CollectionConfig {
  if (args.payloadBlocks) return addPayloadBlocksBuilder(collection, args, args.payloadBlocks)
  const { field, clientConfig, blocks, css, sessions, bindings, afterLayout = [], ownFields, fieldRegistry, localization } = args
  const cssField = cssFieldName(field)
  const gate = args.writeGate.hooks(collection.slug)

  // An existing field with this name (also inside rows, collapsibles or unnamed tabs) is reused
  // and moved to the top level.
  const { fields, found } = takeField(collection.fields, field)
  if (found && found.type !== 'json') {
    throw new Error(wrongFieldTypeMessage(collection.slug, field, found.type))
  }
  // (A `blocks` field never gets here: addPayloadBlocksBuilder edits it in place.)
  if (fields.some((f) => 'name' in f && f.name === cssField)) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" already has a field named "${cssField}". The plugin needs this name for the generated CSS.`,
    )
  }

  const base: JSONField = found ?? { name: field, type: 'json', defaultValue: { ...EMPTY_LAYOUT, blocks: [] } }
  const layoutField: JSONField = {
    ...base,
    // Field logic of block props (plugin/hook.ts): the operation's overrideAccess for field access,
    // and the props' afterRead hooks and read access on every read.
    hooks: {
      ...base.hooks,
      beforeValidate: [recordOverrideAccess(), ...(base.hooks?.beforeValidate ?? [])],
      afterRead: [...(base.hooks?.afterRead ?? []), layoutAfterRead({ field, blocks, registry: fieldRegistry, localization })],
    },
    admin: {
      ...base.admin,
      components: { ...base.admin?.components, Field: LAYOUT_FIELD_COMPONENT, Diff: base.admin?.components?.Diff ?? LAYOUT_DIFF_COMPONENT },
      custom: { ...base.admin?.custom, builder: clientConfig },
    },
  }
  const generatedCssField: JSONField = {
    name: cssField,
    type: 'json',
    // Hidden, and no row of generated CSS in Versions > compare.
    admin: { hidden: true, components: { Diff: NO_DIFF_COMPONENT } },
    // A virtual layout (saved sections) needs no stored CSS: the site never renders it directly.
    ...(base.virtual ? { virtual: true } : {}),
  }
  const richText = richTextSupportField(blocks, field)
  if (richText && fields.some((f) => 'name' in f && f.name === richText.name)) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" already has a field named "${richText.name}". The plugin needs this name for rich text block props.`,
    )
  }

  const views = collection.admin?.components?.views
  if (views?.edit?.root) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" replaces the whole document view (admin.components.views.edit.root). The Builder tab cannot be added.`,
    )
  }
  // The "Builder" tab links to the full-screen view. Its own path (the old tab URL) redirects there.
  // Payload's edit view type mixes an index signature with known keys, so a literal never fits.
  const edit = {
    ...views?.edit,
    builder: {
      Component: BUILDER_REDIRECT_COMPONENT,
      path: '/builder',
      tab: { Component: BUILDER_TAB_COMPONENT },
    },
  } as EditViews
  return {
    ...collection,
    fields: [...fields, layoutField, generatedCssField, ...(richText ? [richText] : [])],
    // Payload's document lock stays on: it protects the other fields in the Edit view and the
    // settings drawer. The builder view never takes it; the plugin's own saves keep it.
    hooks: {
      ...collection.hooks,
      // One save at a time per document (live/writeGate.ts): the session's layout saves, the
      // settings drawer's autosave and the region fields endpoint never overwrite each other.
      beforeOperation: [...(collection.hooks?.beforeOperation ?? []), gate.beforeOperation, keepLockBeforeOperation({ collection: collection.slug })],
      afterOperation: [...(collection.hooks?.afterOperation ?? []), gate.afterOperation],
      afterError: [...(collection.hooks?.afterError ?? []), gate.afterError],
      beforeChange: [
        ...(collection.hooks?.beforeChange ?? []),
        layoutBeforeChange({ collection: collection.slug, field, cssField, blocks, css, sessions, bindings, ownFields, fieldRegistry, localization }),
        ...afterLayout,
      ],
      afterChange: [
        ...(collection.hooks?.afterChange ?? []),
        layoutAfterChange({ collection: collection.slug, sessions, writeGate: args.writeGate, props: { field, blocks, registry: fieldRegistry, localization } }),
      ],
    },
    admin: {
      ...collection.admin,
      // A Status column (Draft / Published) in the list, unless the app chose its own columns.
      ...(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts && !collection.admin?.defaultColumns
        ? { defaultColumns: [collection.admin?.useAsTitle ?? 'id', '_status', 'updatedAt'] }
        : {}),
      components: {
        ...collection.admin?.components,
        // The builder's settings drawer must not show a second Publish (see settingsDrawer.tsx).
        // A collection with its own Publish button keeps it.
        edit: {
          ...collection.admin?.components?.edit,
          PublishButton: collection.admin?.components?.edit?.PublishButton ?? PUBLISH_BUTTON_COMPONENT,
        },
        views: { ...views, edit },
      },
    },
  }
}

/**
 * The builder on a collection whose builder field is its own Payload `blocks` field: the field
 * stays exactly as the collection declares it (place, editor, hooks, validation, access, versions),
 * and no other field holds the content. The builder adds the Builder tab and view, the write gate,
 * the stale-save check and the handover of saves from elsewhere to the live session.
 */
function addPayloadBlocksBuilder(collection: CollectionConfig, args: AddBuilderArgs, storage: PayloadBlocksStorage): CollectionConfig {
  const { field, clientConfig, sessions, ownFields = [] } = args
  const gate = args.writeGate.hooks(collection.slug)
  // The inspector edits rich text props with Payload's editor through a virtual field (no column).
  const richText = richTextSupportField(storage.blocks as BlockDefinition[], field)
  if (richText && collection.fields.some((f) => 'name' in f && f.name === richText.name)) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" already has a field named "${richText.name}". The plugin needs this name for rich text block props.`,
    )
  }
  const views = collection.admin?.components?.views
  if (views?.edit?.root) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" replaces the whole document view (admin.components.views.edit.root). The Builder tab cannot be added.`,
    )
  }
  const edit = {
    ...views?.edit,
    builder: { Component: BUILDER_REDIRECT_COMPONENT, path: '/builder', tab: { Component: BUILDER_TAB_COMPONENT } },
  } as EditViews
  // The builder view reads its config from here: a hidden virtual field, so the blocks field stays untouched.
  const configField: JSONField = {
    name: builderConfigFieldName(field),
    type: 'json',
    virtual: true,
    admin: { hidden: true, disableListColumn: true, disableListFilter: true, custom: { builder: clientConfig } },
  }
  const skip = [builderConfigFieldName(field), ...(richText ? [richText.name] : []), ...ownFields]
  return {
    ...collection,
    fields: [...collection.fields, configField, ...(richText ? [richText] : [])],
    hooks: {
      ...collection.hooks,
      beforeOperation: [...(collection.hooks?.beforeOperation ?? []), gate.beforeOperation, keepLockBeforeOperation({ collection: collection.slug })],
      afterOperation: [...(collection.hooks?.afterOperation ?? []), gate.afterOperation],
      afterError: [...(collection.hooks?.afterError ?? []), gate.afterError],
      beforeChange: [...(collection.hooks?.beforeChange ?? []), payloadBlocksBeforeChange({ collection: collection.slug, field, skip })],
      afterChange: [
        ...(collection.hooks?.afterChange ?? []),
        payloadBlocksAfterChange({ collection: collection.slug, field, sessions, writeGate: args.writeGate }),
      ],
    },
    admin: {
      ...collection.admin,
      ...(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts && !collection.admin?.defaultColumns
        ? { defaultColumns: [collection.admin?.useAsTitle ?? 'id', '_status', 'updatedAt'] }
        : {}),
      components: {
        ...collection.admin?.components,
        edit: {
          ...collection.admin?.components?.edit,
          PublishButton: collection.admin?.components?.edit?.PublishButton ?? PUBLISH_BUTTON_COMPONENT,
        },
        views: { ...views, edit },
      },
    },
  }
}

/** A block definition without style controls (classes, animations, default classes). */
function withoutStyles(def: BlockDefinition): BlockDefinition {
  const { defaultClassName: _defaultClassName, ...rest } = def
  return { ...rest, styles: false }
}

/** Name of the hidden virtual field that carries the builder's config for a Payload blocks field. */
export function builderConfigFieldName(field: string): string {
  return `${field}Builder`
}

/** The error for a layout field name that a field of another type already uses. */
function wrongFieldTypeMessage(collection: string, field: string, type: string): string {
  const suggestion = field === 'builderLayout' ? 'builder' : 'builderLayout'
  const intro = `[websiteBuilder] Collection "${collection}" already has a "${type}" field named "${field}". The builder stores its layout in a "json" field.`
  if (type === 'blocks') {
    // The builder edits a top-level blocks field itself. Here the field is somewhere it cannot reach.
    return (
      `[websiteBuilder] Collection "${collection}" has a "blocks" field named "${field}" that is not at the top level (or in rows, collapsibles or unnamed tabs). ` +
      'Move it there, and the builder edits that field itself. See "Using existing Payload blocks" in the payload-canvas README.'
    )
  }
  return `${intro} Pick another name: websiteBuilder({ collections: { ${collection}: { field: '${suggestion}' } } }).`
}

/** The first richText field in a list of fields (at any depth) that matches `test`. */
function findRichText(fields: readonly Field[], test: (f: RichTextField) => boolean): RichTextField | undefined {
  for (const f of fields) {
    if (f.type === 'richText' && test(f)) return f
    const nested =
      f.type === 'tabs'
        ? f.tabs.flatMap((tab) => tab.fields)
        : f.type === 'blocks'
          ? (f.blocks ?? []).flatMap((b) => (typeof b === 'string' ? [] : b.fields))
          : 'fields' in f && Array.isArray(f.fields)
            ? f.fields
            : []
    const found = findRichText(nested, test)
    if (found) return found
  }
  return undefined
}

/**
 * A hidden, virtual richText field (no database column). The block inspector renders Payload's
 * Lexical editor through it (`RenderLexical` needs a real field config). It uses the editor of the
 * first block richText field that sets one, otherwise the app's default editor.
 * `undefined` when no block has a richText prop.
 */
function richTextSupportField(blocks: BlockDefinition[], layoutField: string): RichTextField | undefined {
  const all = blocks.flatMap((block) => block.fields)
  if (!findRichText(all, () => true)) return undefined
  const editor = findRichText(all, (f) => Boolean(f.editor))?.editor
  return {
    name: richTextFieldName(layoutField),
    type: 'richText',
    virtual: true,
    // Payload makes virtual fields read-only unless readOnly is explicitly false.
    admin: { hidden: true, readOnly: false },
    ...(editor ? { editor } : {}),
  }
}

/**
 * Finds a field by name at the data top level: directly, or inside rows, collapsibles and
 * unnamed tabs. Returns the field list without it.
 */
function takeField(fields: Field[], name: string): { fields: Field[]; found?: Field } {
  let found: Field | undefined
  const walk = (list: Field[]): Field[] =>
    list.flatMap((f): Field[] => {
      if (found) return [f]
      if ('name' in f && f.name === name) {
        found = f
        return []
      }
      if (f.type === 'row' || f.type === 'collapsible') return [{ ...f, fields: walk(f.fields) }]
      if (f.type === 'tabs') {
        return [{ ...f, tabs: f.tabs.map((tab) => ('name' in tab && tab.name ? tab : { ...tab, fields: walk(tab.fields) })) }]
      }
      return [f]
    })
  const result = walk(fields)
  return { fields: found ? result : fields, found }
}
