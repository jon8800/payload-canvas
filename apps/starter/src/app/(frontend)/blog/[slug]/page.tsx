import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta } from '@/utilities/generateMeta'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function BlogPost({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    draft,
    depth: 2,
  })

  const post = docs[0]
  if (!post) return notFound()

  const author = typeof post.author === 'object' && post.author !== null ? post.author : null
  const featuredImage =
    typeof post.featuredImage === 'object' && post.featuredImage !== null
      ? post.featuredImage
      : null
  const categories = Array.isArray(post.categories)
    ? post.categories
        .map((c) => (typeof c === 'object' && c !== null ? c.title : null))
        .filter(Boolean)
    : []
  const tags = Array.isArray(post.tags)
    ? post.tags
        .map((t) => (typeof t === 'object' && t !== null ? t.title : null))
        .filter(Boolean)
    : []

  return (
    <>
      {draft && <LivePreviewListener />}
      <article className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">{post.title}</h1>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        {author && <span>By {author.email}</span>}
        {post.publishedAt && (
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        )}
        {categories.length > 0 && <span>Categories: {categories.join(', ')}</span>}
        {tags.length > 0 && <span>Tags: {tags.join(', ')}</span>}
      </div>

      {featuredImage?.url && (
        <img
          src={featuredImage.url}
          alt={featuredImage.alt || post.title}
          className="mt-6 w-full rounded-lg"
        />
      )}

      {post.excerpt && <p className="mt-6 text-lg text-muted-foreground">{post.excerpt}</p>}

      <div className="mt-8">
        <RenderBlocks blocks={(post.layout as any[]) || []} compiledBlockCSS={(post as any)._compiledBlockCSS} />
      </div>
    </article>
    </>
  )
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    limit: 1000,
    where: { _status: { equals: 'published' } },
    select: { slug: true },
  })

  return docs.map((post) => ({ slug: post.slug }))
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
