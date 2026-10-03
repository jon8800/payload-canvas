import path from 'node:path'
import type { CollectionConfig, Config, Field, JSONField, Plugin } from 'payload'
import { defaultBlocks } from '../blocks'
import { EMPTY_LAYOUT, type BlockDefinition, type BuilderClientConfig } from '../core/types'
import { getCanvasCssInput, type CssOptions, type TailwindPlugins } from '../css'
import { layoutBeforeChange } from './hook'
import { toJsonSafe } from './jsonSafe'

export type { GeneratedCss } from './hook'

export type BuilderCollectionOptions = {
  /** Name of the layout JSON field. Default "layout". */
  field?: string
  /** Frontend path of a document. Used for preview. */
  url?: (doc: Record<string, unknown>) => string
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
}

const LAYOUT_FIELD_COMPONENT = '@payload-toolkit/builder/client#LayoutField'
const TAB_VIEW_COMPONENT = '@payload-toolkit/builder/client#BuilderTabView'
const CANVAS_CSS_PATH = '/builder/canvas-css'

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
    const blocks = options.blocks ?? defaultBlocks()
    const clientBlocks = toJsonSafe(blocks)
    const css: CssOptions = {
      entry: path.resolve(process.cwd(), options.css.entry),
      plugins: options.css.plugins,
    }
    const apiRoute = config.routes?.api ?? '/api'
    const canvasPath = options.canvasPath ?? '/builder-canvas'
    const collections = config.collections ?? []

    for (const slug of Object.keys(options.collections)) {
      if (!collections.some((c) => c.slug === slug)) {
        throw new Error(
          `[websiteBuilder] Collection "${slug}" does not exist. Known collections: ${collections.map((c) => c.slug).join(', ')}.`,
        )
      }
    }

    const fieldNames: Record<string, string> = {}

    return {
      ...config,
      collections: collections.map((collection) => {
        const collectionOptions = options.collections[collection.slug]
        if (!collectionOptions) return collection
        const field = collectionOptions.field ?? 'layout'
        fieldNames[collection.slug] = field
        const clientConfig: BuilderClientConfig = {
          collection: collection.slug,
          field,
          blocks: clientBlocks,
          canvasPath,
          cssEndpoint: `${apiRoute}${CANVAS_CSS_PATH}`,
        }
        return addBuilder(collection, { field, clientConfig, blocks, css })
      }),
      endpoints: [
        ...(config.endpoints ?? []),
        {
          path: CANVAS_CSS_PATH,
          method: 'get',
          handler: async (req) => {
            if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
            const input = await getCanvasCssInput(css)
            return Response.json(input, { headers: { 'Cache-Control': 'private, max-age=60' } })
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
    fields: [...fields, layoutField, generatedCssField],
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
