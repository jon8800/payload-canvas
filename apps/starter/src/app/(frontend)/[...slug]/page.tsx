import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta } from '@/utilities/generateMeta'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string[] }>
}

export default async function Page({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const slugPath = slug.join('/')

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slugPath } },
    limit: 1,
    draft,
    depth: 2,
  })

  const page = docs[0]
  if (!page) return notFound()

  return (
    <>
      {draft && <LivePreviewListener />}
      <main>
        <RenderBlocks blocks={(page.layout as any[]) || []} compiledBlockCSS={(page as any)._compiledBlockCSS} />
      </main>
    </>
  )
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    limit: 1000,
    where: { _status: { equals: 'published' } },
    select: { slug: true },
  })

  return docs.map((page) => ({
    slug: page.slug ? page.slug.split('/') : [],
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const slugPath = slug.join('/')

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slugPath } },
    limit: 1,
    select: { title: true, slug: true, meta: true },
  })

  const page = docs[0]
  if (!page) return {}

  return generateMeta({ doc: page })
}
