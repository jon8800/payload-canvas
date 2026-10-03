import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { BuilderContent } from '@/components/BuilderContent'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta } from '@/utilities/generateMeta'

export default async function HomePage() {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const siteSettings = await payload.findGlobal({ slug: 'site-settings' })

  const homePageRef = siteSettings.homePage

  if (!homePageRef) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-lg text-muted-foreground">
          No homepage configured. Set one in Site Settings.
        </p>
      </main>
    )
  }

  const homePageId = typeof homePageRef === 'object' ? homePageRef.id : homePageRef
  const { docs } = await payload.find({
    collection: 'pages',
    where: { id: { equals: homePageId } },
    limit: 1,
    depth: 0,
    draft,
  })

  const page = docs[0]

  if (!page) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-lg text-muted-foreground">
          No homepage configured. Set one in Site Settings.
        </p>
      </main>
    )
  }

  return (
    <>
      {draft && <LivePreviewListener />}
      <main>
        <BuilderContent doc={page} payload={payload} draft={draft} />
      </main>
    </>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayload({ config: configPromise })
  const siteSettings = await payload.findGlobal({ slug: 'site-settings' })

  const homePageRef = siteSettings.homePage
  if (!homePageRef) return {}

  const homePageId = typeof homePageRef === 'object' ? homePageRef.id : homePageRef
  const { docs } = await payload.find({
    collection: 'pages',
    where: { id: { equals: homePageId } },
    limit: 1,
    select: { title: true, slug: true, meta: true },
  })

  const page = docs[0]
  if (!page) return {}

  return generateMeta({ doc: page })
}
