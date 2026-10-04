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
import type { AiOptions } from '../ai/types'
import { defaultBlocks } from '../blocks'
import { richTextFieldName } from '../core/blocks'
import { DEFAULT_TEMPLATES_SLUG, DOCUMENT_TEMPLATE_FIELD, TEMPLATE_TARGET_FIELD } from '../core/bindings'
import {
  EMPTY_LAYOUT,
  type BlockDefinition,
  type BuilderClientConfig,
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
import { keepLockBeforeOperation, layoutAfterChange, layoutBeforeChange, type BindingCheck } from './hook'
import {
  DEFAULT_SAVED_SECTIONS_SLUG,
  SAVED_SECTIONS_CONFIG_KEY,
  savedSectionsCollection,
  type SavedSectionsOptions,
  type SavedSectionsServerConfig,
} from './sections'
import { toJsonSafe } from './jsonSafe'
import { listCollectionsOf } from './listCollections'
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

/**
 * Server-only key in `config.custom`: what the site needs to compile one stylesheet for every
 * layout on a page (`compilePageCss` in `@payload-toolkit/builder-react/server`).
 */
export const SITE_CSS_KEY = 'websiteBuilderCss'

/** The value under `SITE_CSS_KEY`. */
export type SiteCssConfig = { css: CssOptions; blocks: BlockDefinition[] }

/** Reads the site CSS config the plugin stored on the Payload config. `null` without the plugin. */
export function siteCssConfigOf(payload: { config: { custom?: Record<string, unknown> } }): SiteCssConfig | null {
  const value = payload.config.custom?.[SITE_CSS_KEY] as SiteCssConfig | undefined
  return value?.css && Array.isArray(value.blocks) ? value : null
}

/** A collection's plural label as plain text (static labels only), else its slug in words ("blog-posts" -> "Blog posts"). */
function collectionLabel(collection: CollectionConfig): string {
  const label = collection.labels?.plural
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string') return first
  }
  const words = collection.slug.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

export type BuilderCollectionOptions = {
  /** Name of the layout JSON field. Default "layout". */
  field?: string
  /**
   * Frontend path of a document. Used for preview. Collections with a `url` can be shown by the
   * collection list block.
   */
  url?: (doc: Record<string, unknown>) => string
  /**
   * Documents render through templates: the plugin adds the templates collection and a `template`
   * relationship (sidebar) to this collection. The site loads the template with `loadTemplate`
   * from `@payload-toolkit/builder-react/server`.
   */
  templates?: boolean
}

export type TemplatesOptions = {
  /** Slug of the templates collection. Default "builder-templates". */
  slug?: string
  /** Hooks for the templates collection, e.g. `afterChange` to revalidate the pages that use templates. */
  hooks?: CollectionConfig['hooks']
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
   * The AI assistant in the editor. Presence enables it. Works with Anthropic, OpenRouter,
   * Cloudflare AI Gateway or any OpenAI-compatible API; without `ai.provider` it reads
   * BUILDER_AI_PROVIDER / OPENROUTER_API_KEY / ANTHROPIC_API_KEY. See docs/ai/providers.md.
   */
  ai?: AiOptions
  /**
   * The theme global (colors, fonts, radius, spacing) with color, font and slider pickers. On by
   * default; `false` leaves it out. Render it on the site with `ThemeStyle` from
   * `@payload-toolkit/builder-react/server`. See the README's "Theme" section.
   */
  theme?: ThemeOptions | false
}

const LAYOUT_FIELD_COMPONENT = '@payload-toolkit/builder/client#LayoutField'
const BUILDER_TAB_COMPONENT = '@payload-toolkit/builder/client#BuilderTab'
const PUBLISH_BUTTON_COMPONENT = '@payload-toolkit/builder/client#PublishButton'
const BUILDER_VIEW_COMPONENT = '@payload-toolkit/builder/rsc#BuilderView'
const BUILDER_REDIRECT_COMPONENT = '@payload-toolkit/builder/rsc#BuilderRedirect'
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

    for (const slug of Object.keys(options.collections)) {
      if (!sourceCollections.some((c) => c.slug === slug)) {
        throw new Error(
          `[websiteBuilder] Collection "${slug}" does not exist. Known collections: ${sourceCollections.map((c) => c.slug).join(', ')}.`,
        )
      }
    }

    // Theme: a global with design tokens, rendered by ThemeStyle (builder-react) and the canvas.
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
      builderOptions[templatesSlug] = { field: TEMPLATE_LAYOUT_FIELD }
    }

    const blocks = listCollectionsOf(options.blocks ?? defaultBlocks(), [...withUrl])

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
    }
    const clientBlocks = toJsonSafe(blocks)
    const css: CssOptions = {
      entry: path.resolve(process.cwd(), options.css.entry),
      plugins: options.css.plugins,
    }
    const liveCollections: Record<string, BuilderCollectionServer> = Object.fromEntries(
      Object.entries(builderOptions).map(([slug, o]) => [slug, { field: o.field ?? 'layout', ...(o.url ? { url: o.url } : {}) }]),
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
                  return [slug, new Set([field, cssFieldName(field), richTextFieldName(field), DOCUMENT_TEMPLATE_FIELD])]
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

    return {
      ...config,
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
        if (!collectionOptions) return collection
        const field = collectionOptions.field ?? 'layout'
        fieldNames[collection.slug] = field
        const clientConfig: BuilderClientConfig = {
          collection: collection.slug,
          field,
          blocks: clientBlocks,
          canvasPath,
          cssEndpoint: `${apiRoute}${CANVAS_CSS_PATH}`,
          tokensEndpoint: `${apiRoute}${STYLE_TOKENS_PATH}`,
          sections: options.sections ?? [],
          liveEndpoint: `${apiRoute}${LIVE_PATH}`,
          templates: clientTemplates,
          ai: options.ai ? aiClientConfig(options.ai, `${apiRoute}${AI_PATH}`) : null,
          savedSections: savedSections ? { collection: savedSections.slug } : null,
          themeEndpoint: theme ? theme.endpoint : null,
        }
        return addBuilder(collection, {
          field,
          clientConfig,
          blocks,
          css,
          sessions: live.sessions,
          bindings: bindingCheck(collection.slug),
          // Runs after the layout hook, so it sees the live session's layout.
          afterLayout: collection.slug === templatesSlug && targets.length > 0 ? [requireBlocksForDefault] : [],
        })
      }),
      // Server-only: the MCP tools read the live runtime from here, so they share the bus and lock.
      custom: {
        ...config.custom,
        [LIVE_RUNTIME_KEY]: live,
        [BUILDER_CONFIG_KEY]: serverConfig,
        [SITE_CSS_KEY]: { css, blocks } satisfies SiteCssConfig,
        ...(templates ? { [TEMPLATES_CONFIG_KEY]: templates } : {}),
        ...(theme ? { [THEME_CONFIG_KEY]: theme } : {}),
        ...(savedSections ? { [SAVED_SECTIONS_CONFIG_KEY]: savedSections } : {}),
      },
      globals: themeOptions ? [...(config.globals ?? []), themeGlobal(themeOptions)] : config.globals,
      endpoints: [
        ...(config.endpoints ?? []),
        ...liveEndpoints({ collections: liveCollections, blocks, runtime: live, heartbeatMs: options.live?.heartbeatMs }),
        ...documentEndpoints({
          collections: liveCollections,
          templates: serverConfig.templates,
          runtime: live,
          // The publish check uses the same binding rules as the save hook of each collection.
          check: { blocks, bindings: bindingCheck(templatesSlug) },
        }),
        ...(options.ai
          ? aiEndpoints({
              ai: options.ai,
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
        await config.onInit?.(payload)
        // Save unsaved live edits when the server stops.
        installShutdownFlush(live.sessions)
        for (const [slug, field] of Object.entries(fieldNames)) {
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
}

function addBuilder(collection: CollectionConfig, args: AddBuilderArgs): CollectionConfig {
  const { field, clientConfig, blocks, css, sessions, bindings, afterLayout = [] } = args
  const cssField = cssFieldName(field)

  // An existing field with this name (also inside rows, collapsibles or unnamed tabs) is reused
  // and moved to the top level.
  const { fields, found } = takeField(collection.fields, field)
  if (found && found.type !== 'json') {
    throw new Error(
      `[websiteBuilder] Field "${field}" in collection "${collection.slug}" must be a "json" field, not "${found.type}".`,
    )
  }
  if (fields.some((f) => 'name' in f && f.name === cssField)) {
    throw new Error(
      `[websiteBuilder] Collection "${collection.slug}" already has a field named "${cssField}". The plugin needs this name for the generated CSS.`,
    )
  }

  const base: JSONField = found ?? { name: field, type: 'json', defaultValue: { ...EMPTY_LAYOUT, blocks: [] } }
  const layoutField: JSONField = {
    ...base,
    admin: {
      ...base.admin,
      components: { ...base.admin?.components, Field: LAYOUT_FIELD_COMPONENT },
      custom: { ...base.admin?.custom, builder: clientConfig },
    },
  }
  const generatedCssField: JSONField = {
    name: cssField,
    type: 'json',
    admin: { hidden: true },
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
      beforeOperation: [...(collection.hooks?.beforeOperation ?? []), keepLockBeforeOperation({ collection: collection.slug })],
      beforeChange: [
        ...(collection.hooks?.beforeChange ?? []),
        layoutBeforeChange({ collection: collection.slug, field, cssField, blocks, css, sessions, bindings }),
        ...afterLayout,
      ],
      afterChange: [...(collection.hooks?.afterChange ?? []), layoutAfterChange({ collection: collection.slug, sessions })],
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
