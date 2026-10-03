import path from 'node:path'
import type { CollectionConfig, Config, Field, JSONField, Plugin, RichTextField } from 'payload'
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
import { getCanvasCssInput, getStyleTokens, type CssOptions, type TailwindPlugins } from '../css'
import { createLiveRuntime, LIVE_PATH, LIVE_RUNTIME_KEY, liveEndpoints, type LiveBus } from '../live'
import { layoutBeforeChange } from './hook'
import { toJsonSafe } from './jsonSafe'
import { listCollectionsOf } from './listCollections'
import {
  bindingSources,
  documentTemplateField,
  hasFieldNamed,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATES_CONFIG_KEY,
  templatesCollection,
} from './templates'

export type { GeneratedCss } from './hook'

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

export type WebsiteBuilderOptions = {
  collections: Record<string, BuilderCollectionOptions>
  /** Default: defaultBlocks(). */
  blocks?: BlockDefinition[]
  css: {
    /** Path to the app's Tailwind entry CSS, absolute or relative to process.cwd(). */
    entry: string
    plugins?: TailwindPlugins
  }
  /** Frontend route that renders the canvas iframe. Default "/builder-canvas". */
  canvasPath?: string
  /** Ready-made sections shown in the editor's library and offered to AI tools. */
  sections?: SectionDefinition[]
  /**
   * Live editing: open editors receive changes made by AI agents (MCP) and the operations
   * endpoint. The default bus is in-process (one app server). With several servers, pass a bus
   * built on Postgres LISTEN/NOTIFY (see `live/bus.ts`).
   */
  live?: { bus?: LiveBus; heartbeatMs?: number }
  /** Options for the templates collection. It exists when a collection sets `templates: true`. */
  templates?: TemplatesOptions
}

const LAYOUT_FIELD_COMPONENT = '@payload-toolkit/builder/client#LayoutField'
const TAB_VIEW_COMPONENT = '@payload-toolkit/builder/client#BuilderTabView'
const CANVAS_CSS_PATH = '/builder/canvas-css'
const STYLE_TOKENS_PATH = '/builder/style-tokens'

/** Name of the hidden field that stores the generated CSS (`{ hash, css }`) for a layout field. */
export function cssFieldName(field: string): string {
  return `${field}Css`
}

/**
 * The website builder plugin. Put it LAST in `plugins`: plugins such as SEO with `tabbedUI`
 * move all fields into tabs, and the layout field must stay a top-level field so the
 * Builder tab can always render it.
 */
export function websiteBuilder(options: WebsiteBuilderOptions): Plugin {
  return (config: Config): Config => {
    const apiRoute = config.routes?.api ?? '/api'
    const canvasPath = options.canvasPath ?? '/builder-canvas'
    const sourceCollections = config.collections ?? []
    const live = createLiveRuntime(options.live?.bus)

    for (const slug of Object.keys(options.collections)) {
      if (!sourceCollections.some((c) => c.slug === slug)) {
        throw new Error(
          `[websiteBuilder] Collection "${slug}" does not exist. Known collections: ${sourceCollections.map((c) => c.slug).join(', ')}.`,
        )
      }
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
        templatesCollection({ slug: templatesSlug, targets, hooks: options.templates?.hooks }),
      ]
      builderOptions[templatesSlug] = { field: TEMPLATE_LAYOUT_FIELD }
    }

    const blocks = listCollectionsOf(options.blocks ?? defaultBlocks(), [...withUrl])
    const clientBlocks = toJsonSafe(blocks)
    const css: CssOptions = {
      entry: path.resolve(process.cwd(), options.css.entry),
      plugins: options.css.plugins,
    }
    const liveCollections = Object.fromEntries(
      Object.entries(builderOptions).map(([slug, o]) => [slug, { field: o.field ?? 'layout' }]),
    )

    // Bindable fields of every template target and every collection the list block can show.
    // The plugin's own fields are left out.
    const templates: TemplatesClientConfig | null =
      targets.length > 0
        ? {
            collection: templatesSlug,
            targetField: TEMPLATE_TARGET_FIELD,
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

    const fieldNames: Record<string, string> = {}

    return {
      ...config,
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
        }
        return addBuilder(collection, { field, clientConfig, blocks, css })
      }),
      // Server-only: the MCP tools read the live runtime from here, so they share the bus and lock.
      custom: { ...config.custom, [LIVE_RUNTIME_KEY]: live, ...(templates ? { [TEMPLATES_CONFIG_KEY]: templates } : {}) },
      endpoints: [
        ...(config.endpoints ?? []),
        ...liveEndpoints({ collections: liveCollections, blocks, runtime: live, heartbeatMs: options.live?.heartbeatMs }),
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
            return Response.json(tokens, { headers: { 'Cache-Control': 'private, max-age=60' } })
          },
        },
      ],
      onInit: async (payload) => {
        await config.onInit?.(payload)
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
}

function addBuilder(collection: CollectionConfig, args: AddBuilderArgs): CollectionConfig {
  const { field, clientConfig, blocks, css } = args
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
  // Payload's edit view type mixes an index signature with known keys, so a literal never fits.
  const edit = {
    ...views?.edit,
    builder: {
      Component: TAB_VIEW_COMPONENT,
      path: '/builder',
      tab: { label: 'Builder', href: '/builder' },
    },
  } as EditViews
  return {
    ...collection,
    fields: [...fields, layoutField, generatedCssField, ...(richText ? [richText] : [])],
    hooks: {
      ...collection.hooks,
      beforeChange: [
        ...(collection.hooks?.beforeChange ?? []),
        layoutBeforeChange({ collection: collection.slug, field, cssField, blocks, css }),
      ],
    },
    admin: {
      ...collection.admin,
      components: {
        ...collection.admin?.components,
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
