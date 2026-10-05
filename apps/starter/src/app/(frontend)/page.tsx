import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { partOf, SiteFrame, visitorOf } from '@/components/BuilderContent'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { generateMeta } from '@/utilities/generateMeta'
import { requestLocale } from '@/lib/i18n'

/** The home page from Site Settings, with the visitor's access (published only for visitors). */
async function findHomePage(draft: boolean, depth = 0) {
  const payload = await getPayload({ config: configPromise })
  const siteSettings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const ref = siteSettings.homePage
  if (!ref) return null
  const id = typeof ref === 'object' ? ref.id : ref
  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [{ id: { equals: id } }, ...(draft ? [] : [{ _status: { equals: 'published' as const } }])] },
    limit: 1,
    depth,
    draft,
    overrideAccess: false,
    user: (await visitorOf(payload, draft)) as never,
    // Translation demo: the layout comes back in the page's language (/de).
    locale: (await requestLocale()) as never,
  })
  return docs[0] ?? null
}

export default async function HomePage() {
  const { isEnabled: draft } = await draftMode()
  const page = await findHomePage(draft)

  return (
    <SiteFrame pathname="/" draft={draft} main={partOf(page)}>
      {draft ? <LivePreviewListener /> : null}
      {page ? null : (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-6">
          <p className="text-lg text-muted-foreground">No homepage configured. Set one in Site Settings.</p>
        </div>
      )}
    </SiteFrame>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const page = await findHomePage(draft, 1)
  // The home page is titled by the site name; its own title shows only when SEO sets one.
  return generateMeta({ doc: page ? { ...page, title: null } : null, path: '/' })
}
