// Dev fixture: legacy pages in the old shape (a Payload `blocks` field), with published versions,
// newer drafts and draft-only pages. Run with NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1:
//   pnpm payload run src/legacy-fixture/seed.ts
// Reads two media documents and one page (never changes them). Replaces earlier fixture documents.
import config from '@payload-config'
import { getPayload } from 'payload'

import { LEGACY_COLLECTION, legacyDemo } from './enabled'

if (!legacyDemo) {
  console.error('Set NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1 first.')
  process.exit(1)
}

const payload = await getPayload({ config })
const collection = LEGACY_COLLECTION as never
const context = { disableRevalidate: true }
type Doc = { id: number | string }

const media = await payload.find({ collection: 'media', limit: 2, depth: 0, sort: 'createdAt' })
const [imageA, imageB] = media.docs.map((d) => d.id)
const anyPage = (await payload.find({ collection: 'pages', limit: 1, depth: 0, where: { _status: { equals: 'published' } } })).docs[0]
if (!imageA) throw new Error('The fixture needs at least one media document.')

const text = (value: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [{ type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, children: [{ type: 'text', text: value, format: 0, mode: 'normal', style: '', detail: 0, version: 1 }] }],
  },
})

const homeLayout = (title: string) => [
  { blockType: 'sectionIntro', eyebrow: 'Welcome', heading: title, paragraphs: [{ text: 'A page made with Payload blocks.' }, { text: 'Converted to the builder.' }] },
  {
    blockType: 'fullWidth',
    paddingTop: 'small',
    background: 'default',
    content: [
      { blockType: 'heading', eyebrow: 'Our story', text: 'Built on Payload blocks', level: 'h2' },
      { blockType: 'richText', content: text('Rich text from the old layout field.') },
      { blockType: 'image', image: imageA, caption: 'An uploaded image', overlayButton: { label: 'See more', link: { type: 'custom', url: '/blog' } } },
      { blockType: 'button', link: anyPage ? { type: 'reference', reference: { relationTo: 'pages', value: anyPage.id }, label: 'Read the page' } : { type: 'custom', url: '/', label: 'Home' }, variant: 'primary' },
    ],
  },
  {
    blockType: 'twoColumn',
    columnRatio: '67-33',
    leftColumn: [
      { blockType: 'heading', text: 'Left column', level: 'h3' },
      { blockType: 'richText', content: text('Move me to the right column.') },
    ],
    rightColumn: [{ blockType: 'image', image: imageB ?? imageA, aspect: 'square' }],
  },
]

const faqLayout = [
  {
    blockType: 'fullWidth',
    content: [
      {
        blockType: 'faqAccordion',
        heading: 'Questions',
        source: 'manual',
        faqs: [
          { question: 'Does the old field stay?', answer: text('Yes. The migration never changes it.') },
          { question: 'Are drafts converted?', answer: text('Yes, every version is.') },
        ],
      },
    ],
  },
]

// Fresh start.
await payload.delete({ collection, where: { id: { exists: true } }, context })

// 1. Published twice, then a newer draft.
const home: Doc = await payload.create({ collection, data: { title: 'Legacy home', slug: 'legacy-home', layout: homeLayout('Hello from Payload blocks'), _status: 'published' } as never, context })
await payload.update({ collection, id: home.id, data: { layout: homeLayout('Hello again (published)'), _status: 'published' } as never, context })
await payload.update({ collection, id: home.id, data: { layout: homeLayout('A newer draft heading') } as never, draft: true, context })

// 2. Draft only, saved twice.
const draftOnly: Doc = await payload.create({ collection, data: { title: 'Legacy draft', slug: 'legacy-draft', layout: homeLayout('Draft only'), _status: 'draft' } as never, draft: true, context })
await payload.update({ collection, id: draftOnly.id, data: { layout: homeLayout('Draft only, second save') } as never, draft: true, context })

// 3. Published, then old data the current configs no longer have: a removed block type and a
//    removed field (written past validation, as left behind by earlier versions of the site).
const faq: Doc = await payload.create({ collection, data: { title: 'Legacy FAQ', slug: 'legacy-faq', layout: faqLayout, _status: 'published' } as never, context })
const stored = (await payload.findByID({ collection, id: faq.id, depth: 0 })) as unknown as { layout: Array<Record<string, unknown>> }
const withLeftovers = [
  ...stored.layout.map((block) => ({ ...block, oldSpacing: 'wide' })),
  { id: 'old-promo-1', blockType: 'promoBanner', title: 'A block type the site removed' },
]
await payload.db.updateOne({ collection, id: faq.id, data: { layout: withLeftovers }, returning: false })

const versions = await payload.countVersions({ collection })
console.log(`Seeded 3 legacy pages (${home.id}, ${draftOnly.id}, ${faq.id}) and ${versions.totalDocs} versions.`)
process.exit(0)
