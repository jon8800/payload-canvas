// Dev fixture route (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1): a legacy page rendered by the builder from
// its converted `builderLayout`, or with `?old=1` by the site's old renderer from the Payload
// `blocks` field, to compare the two. 404 when the fixture is off.
import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { normalizeLayout } from '@payload-toolkit/builder/core'
import { generatedCss, SiteFrame, visitorOf } from '@/components/BuilderContent'
import { loadPageData } from '@/components/blocks/server'
import { RenderBlocks } from '@/legacy-fixture/components'
import { LEGACY_COLLECTION, legacyDemo } from '@/legacy-fixture/enabled'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ old?: string }> }

export default async function LegacyDemoPage({ params, searchParams }: Props) {
  if (!legacyDemo) notFound()
  const { isEnabled: draft } = await draftMode()
  const { slug } = await params
  const old = (await searchParams).old === '1'
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: LEGACY_COLLECTION as never,
    where: { and: [{ slug: { equals: slug } }, ...(draft ? [] : [{ _status: { equals: 'published' } }])] },
    limit: 1,
    draft,
    // The old renderer reads populated uploads and links, as the site did.
    depth: old ? 2 : 0,
    overrideAccess: false,
    user: (await visitorOf(payload, draft)) as never,
  })
  const page = docs[0] as Record<string, unknown> | undefined
  if (!page) notFound()

  if (old) {
    return (
      <SiteFrame pathname={`/legacy-demo/${slug}`} draft={draft}>
        <RenderBlocks blocks={page.layout as never} />
      </SiteFrame>
    )
  }
  const layout = normalizeLayout(page.builderLayout)
  const pageData = await loadPageData({ payload })
  return (
    <SiteFrame
      pathname={`/legacy-demo/${slug}`}
      draft={draft}
      main={{ layout, css: generatedCss(page.builderLayoutCss), pageData }}
    />
  )
}
