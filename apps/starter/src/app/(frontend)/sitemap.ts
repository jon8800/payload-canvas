import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getServerSideURL } from '@/utilities/getURL'
import { unstable_cache } from 'next/cache'

const getCachedSitemap = unstable_cache(
  async () => {
    const payload = await getPayload({ config: configPromise })
    const siteUrl = getServerSideURL()

    const [{ docs: pages }, { docs: posts }] = await Promise.all([
      payload.find({
        collection: 'pages',
        where: { _status: { equals: 'published' } },
        limit: 1000,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        limit: 1000,
        select: { slug: true, updatedAt: true },
      }),
    ])

    const sitemap: MetadataRoute.Sitemap = [
      { url: siteUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ]

    for (const page of pages) {
      if (page.slug === 'home') continue

      sitemap.push({
        url: `${siteUrl}/${page.slug}`,
        lastModified: page.updatedAt ? new Date(page.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    for (const post of posts) {
      sitemap.push({
        url: `${siteUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }

    return sitemap
  },
  ['sitemap'],
  { tags: ['pages-sitemap', 'posts-sitemap'] },
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getCachedSitemap()
}
