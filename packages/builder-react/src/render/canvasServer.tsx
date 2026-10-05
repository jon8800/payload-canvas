// Server only. The canvas server action: renders blocks with the site's own server components for
// the canvas iframe, and loads the page data. See `createCanvasServer`.

import { siteCssConfigOf } from '@payload-toolkit/builder'
import { knownLocale, localeSettingsOf, normalizeLayout, type Block, type BlockDefinition, type TemplateContext } from '@payload-toolkit/builder/core'
import { headers } from 'next/headers'
import { getPayload, type Payload, type SanitizedConfig } from 'payload'

import { defaultComponents } from '../components'
import type {
  CanvasDocumentRef,
  CanvasScope,
  CanvasServerRequest,
  CanvasServerResponse,
  CanvasServerResult,
} from './canvasServerTypes'
import { isRecord } from './fields'
import { defaultResolveLink } from './link'
import { renderPreviewBlock } from './RenderLayout'
import { localeArgs, type LocaleArgs } from './locale'
import { loadLayoutData } from './resolve'
import type { BlockComponents, PageData, ResolveLink } from './types'

/** What the `pageData` loader gets. */
export type PageDataArgs = {
  payload: Payload
  /** The signed-in user (the canvas needs one). */
  user: unknown
  /** The document open in the builder. Null for section thumbnails. */
  document: CanvasDocumentRef | null
  /** In a template: the sample document (`depth: 1`, latest draft). */
  context: TemplateContext | null
  /**
   * The locale the editor shows, or null without localization. Load the page
   * data in it (`payload.find({ locale })`), as the site does for the page's locale.
   */
  locale: string | null
}

export type CanvasServerOptions = {
  /** Your Payload config (`import config from '@payload-config'`). */
  config: SanitizedConfig | Promise<SanitizedConfig>
  /** The block definitions. Default: the plugin's `blocks`. */
  blocks?: BlockDefinition[]
  /**
   * The site's block components, server components included: the same map the site passes to
   * `RenderLayout`. The canvas asks for the blocks it cannot render itself.
   */
  components?: BlockComponents
  /** The site's link resolver. */
  resolveLink?: ResolveLink
  /**
   * Loads the page data (plain data) the site passes to `RenderLayout` as `pageData`. Runs once
   * when the canvas opens, and for each server render.
   */
  pageData?: (args: PageDataArgs) => PageData | Promise<PageData>
}

/** At most this many blocks per request. */
const MAX_BLOCKS = 100

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const isDocumentRef = (value: unknown): value is CanvasDocumentRef =>
  isRecord(value) && typeof value.collection === 'string' && (typeof value.id === 'string' || typeof value.id === 'number')

function scopeOf(value: unknown): CanvasScope {
  const scope = isRecord(value) ? value : {}
  return {
    document: isDocumentRef(scope.document) ? scope.document : null,
    context: isDocumentRef(scope.context) ? scope.context : null,
    locale: typeof scope.locale === 'string' && scope.locale ? scope.locale : null,
  }
}

/** The scope's locale, when the Payload config has it. Unknown codes and sites without localization give null. */
function scopeLocale(payload: Payload, locale: string | null | undefined): string | null {
  const settings = localeSettingsOf(payload.config.localization)
  if (!settings || !locale) return null
  return knownLocale(settings, locale)
}

const isBlock = (value: unknown): value is Block =>
  isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string'

/** The signed-in admin user, or null. */
async function adminUser(payload: Payload): Promise<unknown> {
  try {
    const { user } = await payload.auth({ headers: await headers() })
    if (!user) return null
    return (user as { collection?: string }).collection === payload.config.admin.user ? user : null
  } catch {
    return null
  }
}

/** The template's sample document, with the user's access, in the editor's locale. */
async function loadContext(payload: Payload, ref: CanvasDocumentRef | null, user: unknown, locale: LocaleArgs): Promise<TemplateContext | null> {
  if (!ref) return null
  try {
    const doc = await payload.findByID({
      collection: ref.collection as never,
      id: ref.id,
      depth: 1,
      draft: true,
      overrideAccess: false,
      user: user as never,
      ...locale,
    })
    return { collection: ref.collection, doc: doc as Record<string, unknown> }
  } catch {
    return null
  }
}

/**
 * The handler of the canvas server action. Blocks whose components the canvas cannot run (async
 * server components that load data, components that import server code) render here, with the
 * site's own components, and go back to the canvas as React Server Component output. Client
 * components inside them work in the canvas as on the site.
 *
 * Put it in a `'use server'` file of the canvas route and pass the action to `BuilderCanvas`:
 *
 * ```ts
 * // src/app/(builder-canvas)/builder-canvas/actions.ts
 * 'use server'
 * import config from '@payload-config'
 * import { createCanvasServer, type CanvasServerRequest } from '@payload-toolkit/builder-react/server'
 * import { blocks } from '@/builder'
 * import { serverComponents } from '@/components/blocks.server'
 *
 * const canvas = createCanvasServer({ config, blocks, components: serverComponents })
 *
 * export async function builderCanvas(request: CanvasServerRequest) {
 *   return canvas(request)
 * }
 * ```
 *
 * Only signed-in users of the admin collection get an answer. Data loads as on the site
 * (`loadLayoutData`) with the latest drafts and the user's access for collection lists, in the
 * locale the editor shows (`scope.locale`) with the config's fallback.
 */
export function createCanvasServer(options: CanvasServerOptions) {
  return async function canvasServer(request: CanvasServerRequest): Promise<CanvasServerResponse> {
    const payload = await getPayload({ config: options.config })
    const user = await adminUser(payload)
    if (!user) return { kind: 'error', error: 'Sign in to the admin to preview server blocks.' }
    const blocks = options.blocks ?? siteCssConfigOf(payload)?.blocks ?? []
    const resolveLink = options.resolveLink ?? defaultResolveLink
    const scope = scopeOf(isRecord(request) ? request.scope : null)
    const locale = scopeLocale(payload, scope.locale)
    const localeOptions = { locale }

    const context = await loadContext(payload, scope.context, user, localeArgs(localeOptions))
    let pageData: PageData = {}
    if (options.pageData) {
      try {
        pageData = await options.pageData({ payload, user, document: scope.document, context, locale })
      } catch (error) {
        payload.logger.error({ err: error, msg: '[builder] The canvas page data failed to load.' })
        if (request.kind === 'pageData') return { kind: 'error', error: `Page data: ${message(error)}` }
      }
    }
    if (request.kind === 'pageData') return { kind: 'pageData', data: pageData }
    if (request.kind !== 'blocks' || !Array.isArray(request.blocks)) return { kind: 'error', error: 'Unknown request.' }

    const items = request.blocks
      .slice(0, MAX_BLOCKS)
      .filter((item) => isRecord(item) && typeof item.key === 'string' && isBlock(item.block))
    const results: Record<string, CanvasServerResult> = {}
    let loaded: Block[] = []
    try {
      // One load for every block: one `find` per collection.
      const layout = normalizeLayout({ version: 1, blocks: items.map((item) => item.block) })
      loaded = (await loadLayoutData(layout, blocks, payload, { draft: true, context, resolveLink, user, ...localeOptions })).blocks
    } catch (error) {
      for (const item of items) results[item.key] = { error: `Data failed to load: ${message(error)}` }
      return { kind: 'blocks', results }
    }
    const components = options.components ?? {}
    const byId = new Map(loaded.map((block) => [block.id, block]))
    for (const item of items) {
      const block = byId.get(item.block.id)
      if (!block) {
        results[item.key] = { error: 'The block is not valid.' }
        continue
      }
      if (!components[block.type] && !(block.type in defaultComponents)) {
        results[item.key] = { error: `No component for "${block.type}". Add it to the components of createCanvasServer.` }
        continue
      }
      results[item.key] = { node: renderPreviewBlock(block, { components, blocks, resolveLink, context, pageData }) }
    }
    return { kind: 'blocks', results }
  }
}
