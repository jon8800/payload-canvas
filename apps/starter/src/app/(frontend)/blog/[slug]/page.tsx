import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { renderRichText } from '@payload-toolkit/builder-react'
import { loadTemplate } from '@payload-toolkit/builder-react/server'
import { resolveLink } from '@/builder'
import { partOf, SiteFrame, visitorOf, type LayoutPart } from '@/components/BuilderContent'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta, notFoundMeta } from '@/utilities/generateMeta'
import { MissingPage } from '@/components/NotFoundContent'

type Props = {
  params: Promise<{ slug: string }>
}

/**
 * The post at a slug, read with the visitor's access: a template bound to `author.email` (or any
 * field the visitor may not read) shows nothing to anonymous visitors.
 */
async function findPost(slug: string, draft: boolean, depth = 1) {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { and: [{ slug: { equals: slug } }, ...(draft ? [] : [{ _status: { equals: 'published' as const } }])] },
    limit: 1,
    draft,
    // Depth 1: bound uploads and relationships (featured image, author, categories) arrive as documents.
    depth,
    overrideAccess: false,
    user: (await visitorOf(payload, draft)) as never,
  })
  return { payload, post: docs[0] ?? null }
}

/**
 * A blog post renders through its template: the post's own template, else the default "Post
 * template" (Templates collection). Without a template: the post's own builder layout, then the
 * title and content.
 */
export default async function BlogPost({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params

  const { payload, post } = await findPost(slug, draft)
  if (!post) return <MissingPage pathname={`/blog/${slug}`} />

  const template = await loadTemplate(payload, { collection: 'posts', doc: post, draft })
  const main: LayoutPart | null = template
    ? { layout: template.layout, css: template.css, context: { collection: 'posts', doc: post } }
    : partOf(post)

  return (
    <SiteFrame pathname={`/blog/${slug}`} draft={draft} main={main}>
      {draft ? <LivePreviewListener /> : null}
      {main ? null : (
        <article className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
          <h1 className="text-4xl font-bold tracking-tight">{post.title}</h1>
          {post.content ? <div className="prose max-w-none">{renderRichText(post.content, resolveLink)}</div> : null}
        </article>
      )}
    </SiteFrame>
  )
}

export async function generateStaticParams() {
  // Prerendering is an optimisation: when the database is not reachable at build time
  // (for example in a Docker build), pages render on first request instead.
  try {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'posts',
      limit: 1000,
      where: { _status: { equals: 'published' } },
      select: { slug: true },
    })
    return docs.map((post) => ({ slug: post.slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const { post } = await findPost(slug, draft, 1)
  if (!post) return notFoundMeta()
  return generateMeta({ doc: post, path: `/blog/${slug}` })
}
