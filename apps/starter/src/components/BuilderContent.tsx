// Renders website builder layouts on the site: the page frame (header part, page, footer part)
// with ONE generated stylesheet for every layout on the page.
//
// Why one stylesheet: each layout's stored CSS is complete on its own, but several <style> tags
// break Tailwind's order. A later sheet's `text-lg` (footer) would beat an earlier sheet's
// `md:text-xl` (page). `compilePageCss` compiles the union of the classes once.
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import configPromise from '@payload-config'
import { normalizeLayout, type Layout, type TemplateContext } from 'payload-canvas/core'
import { BuilderStyle, loadLayoutData, RenderLayout, type PageData } from 'payload-canvas/react'
import { compilePageCss } from 'payload-canvas/react/server'
import { builderBlocks, resolveLink } from '@/builder'
import { serverBlockComponents } from '@/components/blocks/server'
import { requestLocale } from '@/lib/i18n'
import { resolveTemplateParts } from '@/utilities/resolveTemplateParts'

/** A document with the plugin's layout field ("builder") and its generated CSS ("builderCss"). */
type BuilderDoc = { builder?: unknown; builderCss?: unknown }

/** One layout to render, with the CSS stored for it (the fallback when the page compile fails). */
export type LayoutPart = {
  layout: Layout
  css: string | null
  /** The document a template renders (load it with depth 1 and the visitor's access). */
  context?: TemplateContext | null
  /** Data the page loads once for its blocks (`RenderLayout`'s `pageData`). */
  pageData?: PageData | null
}

export function generatedCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const css = (value as { css?: unknown }).css
  return typeof css === 'string' ? css : null
}

/** A document's own builder layout as a part. `null` when it has no blocks. */
export function partOf(doc: BuilderDoc | null | undefined): LayoutPart | null {
  if (!doc) return null
  const layout = normalizeLayout(doc.builder)
  return layout.blocks.length > 0 ? { layout, css: generatedCss(doc.builderCss) } : null
}

/**
 * The signed-in user in draft mode, else null. Site data is read with this user's access
 * (`overrideAccess: false`): anonymous visitors never see private fields, such as an author's email.
 */
export async function visitorOf(payload: Payload, draft: boolean): Promise<unknown> {
  if (!draft) return null
  try {
    const { user } = await payload.auth({ headers: await headers() })
    return user ?? null
  } catch {
    return null
  }
}

type RenderArgs = { part: LayoutPart; payload: Payload; draft: boolean; user: unknown; locale?: string }

/** Loads a layout's data (documents, collection lists, bindings) and renders it, without CSS. */
async function BuilderLayout({ part, payload, draft, user, locale }: RenderArgs) {
  const { layout, context, pageData } = part
  // `locale`: related documents and collection lists load in the page's language too.
  const loaded = await loadLayoutData(layout, builderBlocks, payload, { draft, context, resolveLink, user, locale })
  return (
    <RenderLayout
      layout={loaded}
      blocks={builderBlocks}
      components={serverBlockComponents}
      resolveLink={resolveLink}
      context={context}
      pageData={pageData}
    />
  )
}

type SiteFrameProps = {
  /** The request path, for the header and footer display conditions. */
  pathname: string
  draft: boolean
  /** The page's own layout (or the template it renders through). */
  main?: LayoutPart | null
  /** Shown in <main> after the layout, e.g. a fallback when there is no layout. */
  children?: ReactNode
}

/**
 * The site frame: skip link, header part, <main>, footer part, and one stylesheet for every
 * builder layout on the page.
 */
export async function SiteFrame({ pathname, draft, main, children }: SiteFrameProps) {
  const collection = pathname.startsWith('/blog') ? 'posts' : 'pages'
  // Translation demo: the request's language (/de/…), else the default.
  const locale = await requestLocale()
  const [payload, header, footer] = await Promise.all([
    getPayload({ config: configPromise }),
    resolveTemplateParts('header', pathname, collection, draft, locale),
    resolveTemplateParts('footer', pathname, collection, draft, locale),
  ])
  const headerPart = partOf(header)
  const footerPart = partOf(footer)
  const [css, user] = await Promise.all([compilePageCss(payload, [headerPart, main, footerPart]), visitorOf(payload, draft)])

  return (
    <>
      <BuilderStyle css={css} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      {headerPart ? <BuilderLayout part={headerPart} payload={payload} draft={draft} user={user} locale={locale} /> : null}
      <main id="main" tabIndex={-1} className="outline-none">
        {main ? <BuilderLayout part={main} payload={payload} draft={draft} user={user} locale={locale} /> : null}
        {children}
      </main>
      {footerPart ? <BuilderLayout part={footerPart} payload={payload} draft={draft} user={user} locale={locale} /> : null}
    </>
  )
}
