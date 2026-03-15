import { draftMode } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { LivePreviewListener } from '@/components/LivePreviewListener'

export default async function BlogArchive() {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const { docs: posts } = await payload.find({
    collection: 'posts',
    where: draft ? {} : { _status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 12,
    depth: 1,
    draft,
  })

  return (
    <>
      {draft && <LivePreviewListener />}
      <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Blog</h1>

      {posts.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No posts published yet.</p>
      ) : (
        <ul className="mt-8 space-y-8">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/blog/${post.slug}`} className="group block">
                <h2 className="text-xl font-semibold group-hover:underline">{post.title}</h2>
                {post.publishedAt && (
                  <time
                    dateTime={post.publishedAt}
                    className="mt-1 block text-sm text-muted-foreground"
                  >
                    {new Date(post.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                )}
                {post.excerpt && (
                  <p className="mt-2 text-muted-foreground">{post.excerpt}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  )
}
