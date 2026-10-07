// Dev fixture, server only: block components that load data themselves, as on real sites (model
// grids, review carousels, blog listings). They import Payload and the config, so the canvas
// cannot import them: it renders these blocks through its server action (`createCanvasServer`).
import config from '@payload-config'
import { getPayload, type Where } from 'payload'
import { fromPayloadComponents, PayloadSlot, type BlockComponents, type PayloadBlockProps } from 'payload-canvas/react'
import type { PageDataArgs } from 'payload-canvas/react/server'

import { RenderLeaves } from './components'
import { legacyBuilderBlocks } from './index'

const published: Where = { _status: { equals: 'published' } }

const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

/** An async server component: queries the newest posts on each render. */
export async function LatestPostsLeaf({ heading, count }: PayloadBlockProps<{ heading?: string | null; count?: number | null }>) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'posts',
    where: published,
    sort: '-publishedAt',
    limit: Math.min(Math.max(count ?? 3, 1), 12),
    depth: 0,
    select: { title: true, slug: true, publishedAt: true },
  })
  return (
    <div className="space-y-4">
      {heading && <h3 className="text-xl font-semibold">{heading}</h3>}
      <ul className="divide-y divide-amber-200 rounded-lg border border-amber-200">
        {docs.map((post) => (
          <li key={post.id} className="flex items-baseline justify-between gap-4 p-4">
            <a className="font-medium underline-offset-4 hover:underline" href={`/blog/${post.slug}`}>
              {post.title}
            </a>
            {post.publishedAt && <time className="shrink-0 text-sm text-amber-700">{dateFormat.format(new Date(post.publishedAt))}</time>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** An async server section: counts the posts, and renders its blocks field with PayloadSlot. */
export async function PostsSectionComponent({ title, content, builder }: PayloadBlockProps<{ title?: string | null; content?: Array<{ blockType: string }> | null }>) {
  const payload = await getPayload({ config })
  const { totalDocs } = await payload.count({ collection: 'posts', where: published })
  return (
    <section className="bg-amber-50 px-6 py-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-end justify-between gap-4 border-b border-amber-200 pb-4">
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="text-sm text-amber-800">{totalDocs} posts published</p>
        </header>
        <PayloadSlot builder={builder} name="content" className="space-y-8">
          <RenderLeaves blocks={content as never} />
        </PayloadSlot>
      </div>
    </section>
  )
}

/** The site's server components, merged over the client-safe ones by `serverBlockComponents`. */
export const legacyServerComponents: BlockComponents = fromPayloadComponents(
  { latestPosts: LatestPostsLeaf, postsSection: PostsSectionComponent },
  legacyBuilderBlocks,
)

/** The page data the `{ block, context }` components read. One load per page. */
export async function legacyPageData({ payload }: Pick<PageDataArgs, 'payload'>) {
  const { docs, totalDocs } = await payload.find({
    collection: 'posts',
    where: published,
    sort: '-publishedAt',
    limit: 1,
    depth: 0,
    select: { title: true },
  })
  return { postCount: totalDocs, latestPost: docs[0]?.title ?? null }
}
