import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { partOf, SiteFrame, visitorOf } from '@/components/BuilderContent'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta, notFoundMeta } from '@/utilities/generateMeta'
import { MissingPage } from '@/components/NotFoundContent'
import { requestLocale } from '@/lib/i18n'

type Props = {
  params: Promise<{ slug: string[] }>
}

/** The page at a slug, with the visitor's access (published only for visitors). */
async function findPage(slugPath: string, draft: boolean, depth = 0) {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [{ slug: { equals: slugPath } }, ...(draft ? [] : [{ _status: { equals: 'published' as const } }])] },
    limit: 1,
    draft,
    depth,
    overrideAccess: false,
    user: (await visitorOf(payload, draft)) as never,
    // Translation demo: the layout comes back in the page's language (/de/…).
    locale: (await requestLocale()) as never,
  })
  return docs[0] ?? null
}

export default async function Page({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const slugPath = slug.join('/')

  const page = await findPage(slugPath, draft)
  if (!page) return <MissingPage pathname={`/${slugPath}`} />

  return (
    <SiteFrame pathname={`/${slugPath}`} draft={draft} main={partOf(page)}>
      {draft ? <LivePreviewListener /> : null}
    </SiteFrame>
  )
}

export async function generateStaticParams() {
  // Prerendering is an optimisation: when the database is not reachable at build time
  // (for example in a Docker build), pages render on first request instead.
  try {
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
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const slugPath = slug.join('/')
  const page = await findPage(slugPath, draft, 1)
  if (!page) return notFoundMeta()
  return generateMeta({ doc: page, path: `/${slugPath}` })
}
