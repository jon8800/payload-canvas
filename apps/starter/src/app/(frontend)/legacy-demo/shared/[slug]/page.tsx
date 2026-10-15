// Dev fixture route (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1): a page whose Payload blocks field the
// builder edits in place, rendered by the site's own renderer from that field. 404 when the
// fixture is off.
import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { SiteFrame, visitorOf } from '@/components/BuilderContent'
import { RenderBlocks } from '@/legacy-fixture/components'
import { legacyDemo, SHARED_BLOCKS_COLLECTION } from '@/legacy-fixture/enabled'

type Props = { params: Promise<{ slug: string }> }

export default async function SharedBlocksPage({ params }: Props) {
  if (!legacyDemo) notFound()
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: SHARED_BLOCKS_COLLECTION as never,
    where: { and: [{ slug: { equals: slug } }, ...(draft ? [] : [{ _status: { equals: 'published' } }])] },
    limit: 1,
    draft,
    // The site's renderer reads populated uploads and links.
    depth: 2,
    overrideAccess: false,
    user: (await visitorOf(payload, draft)) as never,
  })
  const page = docs[0] as Record<string, unknown> | undefined
  if (!page) notFound()
  return (
    <SiteFrame pathname={`/legacy-demo/shared/${slug}`} draft={draft}>
      <RenderBlocks blocks={page.layout as never} />
    </SiteFrame>
  )
}
