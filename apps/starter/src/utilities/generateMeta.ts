import type { Metadata } from 'next'
import { cache } from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { mergeOpenGraph } from './mergeOpenGraph'
import { getServerSideURL } from './getURL'

type MetaImage = { url?: string | null; alt?: string | null; sizes?: { og?: { url?: string | null } } }

/** The fields of a page or post the metadata reads. Images must be loaded (depth 1 or more). */
export type MetaDoc = {
  title?: string | null
  excerpt?: string | null
  featuredImage?: MetaImage | string | number | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: MetaImage | string | number | null
  } | null
}

/**
 * The site name and description, from Site Settings (`siteName`, `siteDescription`) when the
 * global has them. Read once per request.
 */
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

export const getSiteInfo = cache(async (): Promise<{ name: string | null; description: string | null }> => {
  try {
    const payload = await getPayload({ config: configPromise })
    const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 0 })) as unknown as Record<string, unknown>
    return { name: text(settings.siteName) ?? text(process.env.SITE_NAME), description: text(settings.siteDescription) }
  } catch {
    return { name: null, description: null }
  }
})

function absolute(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${getServerSideURL()}${url.startsWith('/') ? '' : '/'}${url}`
}

function imageOf(image: MetaDoc['featuredImage']): { url: string; alt?: string } | null {
  if (!image || typeof image !== 'object') return null
  const url = image.sizes?.og?.url || image.url
  if (!url) return null
  return { url: absolute(url), ...(image.alt ? { alt: image.alt } : {}) }
}

/**
 * Metadata for a page or post:
 * - title: the SEO title, else the document title, followed by "| Site name" (not repeated when
 *   the SEO title already ends with it); the home page shows the site name alone when untitled;
 * - description: the SEO description, else the post excerpt, else the site description;
 * - Open Graph: the same title and description, the page URL, and the SEO image, else the
 *   featured image.
 */
export async function generateMeta(args: { doc: MetaDoc | null; path: string }): Promise<Metadata> {
  const { doc, path } = args
  const site = await getSiteInfo()
  const own = doc?.meta?.title?.trim() || doc?.title?.trim() || null
  const suffix = site.name ? ` | ${site.name}` : ''
  const title = own ? (suffix && own.endsWith(suffix) ? own : `${own}${suffix}`) : (site.name ?? 'Untitled')
  const description = doc?.meta?.description?.trim() || doc?.excerpt?.trim() || site.description || undefined
  const image = imageOf(doc?.meta?.image) ?? imageOf(doc?.featuredImage)
  const url = absolute(path)

  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: mergeOpenGraph({
      title,
      ...(description ? { description } : {}),
      url,
      ...(site.name ? { siteName: site.name } : {}),
      ...(image ? { images: [image] } : {}),
    }),
  }
}

/** Metadata for a missing page: "Page not found | Site name", never indexed. */
export async function notFoundMeta(): Promise<Metadata> {
  const site = await getSiteInfo()
  return { title: site.name ? `Page not found | ${site.name}` : 'Page not found', robots: { index: false } }
}
