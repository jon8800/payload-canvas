import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { normalizeLayout } from '@payload-toolkit/builder/core'
import { renderRichText } from '@payload-toolkit/builder-react'
import { loadTemplate } from '@payload-toolkit/builder-react/server'
import { resolveLink } from '@/builder'
import { BuilderContent, BuilderLayout } from '@/components/BuilderContent'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta } from '@/utilities/generateMeta'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string }>
}

/**
 * A blog post renders through its template: the post's own template, else the default "Post
 * template" (Templates collection). Without a template: the post's own builder layout, then the
 * title and content.
 */
export default async function BlogPost({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    draft,
    // Depth 1: bound uploads and relationships (featured image, author, categories) arrive as documents.
    depth: 1,
  })

  const post = docs[0]
  if (!post) return notFound()

  const doc = post
  const template = await loadTemplate(payload, { collection: 'posts', doc, draft })
  const ownLayout = normalizeLayout(post.builder)

  return (
    <>
      {draft && <LivePreviewListener />}
      <main>
        {template ? (
          <BuilderLayout
            layout={template.layout}
            css={template.css}
            payload={payload}
            draft={draft}
            context={{ collection: 'posts', doc }}
          />
        ) : ownLayout.blocks.length > 0 ? (
          <BuilderContent doc={post} payload={payload} draft={draft} />
        ) : (
          <article className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight">{post.title}</h1>
            {post.content ? <div className="prose max-w-none">{renderRichText(post.content, resolveLink)}</div> : null}
          </article>
        )}
      </main>
    </>
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
  const { slug } = await params

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    select: { title: true, slug: true, meta: true },
  })

  const post = docs[0]
  if (!post) return {}

  return generateMeta({ doc: post })
}
