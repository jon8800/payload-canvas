// Seeds the demo site: theme, media, a contact form, 5 pages, 3 posts, the post template, a header and a footer.
// Idempotent: it deletes the documents it owns (matched by slug, title or filename) first.
// Run with `pnpm seed:demo`.
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { FORCE_DELETE_CONTEXT } from '@payload-toolkit/builder'
import { validateLayout, withoutBoundRequired, type Block, type Layout } from '@payload-toolkit/builder/core'

import { builderBlocks } from '@/builder'
import { HOME_SLUG } from '@/lib/links'
import {
  cardGrid,
  contact,
  content,
  cta,
  faq,
  features,
  footer,
  header,
  hero,
  imageText,
  lexical,
  pageLink,
  postList,
  postTemplate,
  testimonials,
  url,
  work,
} from '@/data/sections'
import { DEMO_IMAGES, renderDemoImage, type DemoImage } from './seed-demo-images'

const SITE_NAME = 'Northwind Studio'
const PAGE_SLUGS = [HOME_SLUG, 'about', 'services', 'contact', 'blog']
const POST_SLUGS = ['designing-with-blocks', 'a-faster-launch', 'theme-tokens-explained']
const PART_TITLES = ['Header', 'Footer']
const TEMPLATE_NAME = 'Post template'
const FORM_TITLE = 'Contact form'
const CATEGORIES = [
  { title: 'Design', slug: 'design' },
  { title: 'Process', slug: 'process' },
]
/** Images from earlier versions of the seed, removed on the next run. */
const OLD_IMAGE_NAMES = ['demo-studio.png', 'demo-workshop.png', 'demo-launch.png']
const EMAIL = 'hello@northwind.example'
const PHONE = '+1 555 0100'
const HOURS = 'Mon to Fri, 9:00 to 17:00'

/** Seed writes skip the Next.js revalidation hooks: they only work inside the Next.js server. */
const context = { disableRevalidate: true }

type Id = number

function layoutOf(blocks: Block[], where: string): Layout {
  const layout: Layout = { version: 1, blocks }
  // Bound props may stay empty: the document fills them at render time.
  const errors = withoutBoundRequired(validateLayout(layout, builderBlocks), layout)
  if (errors.length > 0) {
    const lines = errors.map((e) => `  ${e.code} ${e.path}: ${e.message}`).join('\n')
    throw new Error(`Invalid layout for ${where}:\n${lines}`)
  }
  return layout
}

async function clear(payload: Payload) {
  const forms = await payload.find({ collection: 'forms', where: { title: { equals: FORM_TITLE } }, limit: 100, depth: 0 })
  const formIds = forms.docs.map((f) => f.id)
  if (formIds.length > 0) {
    await payload.delete({ collection: 'form-submissions', where: { form: { in: formIds } } })
    await payload.delete({ collection: 'forms', where: { id: { in: formIds } } })
  }
  await payload.delete({ collection: 'builder-templates', where: { name: { equals: TEMPLATE_NAME } }, context })
  await payload.delete({ collection: 'template-parts', where: { title: { in: PART_TITLES } }, trash: true, context })
  await payload.delete({ collection: 'posts', where: { slug: { in: POST_SLUGS } }, trash: true, context })
  await payload.delete({ collection: 'pages', where: { slug: { in: PAGE_SLUGS } }, trash: true, context })
  await payload.delete({ collection: 'categories', where: { slug: { in: CATEGORIES.map((c) => c.slug) } } })
  const names = [...DEMO_IMAGES.map((i) => i.name), ...OLD_IMAGE_NAMES]
  // Other pages may still use the demo images. The seed replaces them anyway, so it skips the
  // builder's "still used" check.
  await payload.delete({ collection: 'media', where: { filename: { in: names } }, context: { [FORCE_DELETE_CONTEXT]: true } })
}

/**
 * The studio's theme (the builder plugin's Theme global): warm paper, ink text and a deep green,
 * with Newsreader for headings and Hanken Grotesk for body text. The plugin derives borders and
 * secondary text from these on save.
 */
async function seedTheme(payload: Payload) {
  await payload.updateGlobal({
    slug: 'theme-settings',
    data: {
      colors: {
        primary: '#1f4536',
        secondary: '#ebe5da',
        accent: '#e4dccd',
        muted: '#ece6db',
        destructive: '#b42318',
        background: '#f6f3ec',
        foreground: '#1c1b18',
      },
      fonts: { sans: 'Hanken Grotesk', heading: 'Newsreader' },
      borderRadius: '0.5',
    },
    context,
  })
}

type Media = { id: Id; alt: string }

/** Uploads the demo images. Keys are the file names without "demo-" and ".jpg", e.g. "work-bakery". */
async function seedMedia(payload: Payload): Promise<Record<string, Media>> {
  const result: Record<string, Media> = {}
  const upload = async (img: DemoImage) => {
    const data = await renderDemoImage(img)
    const doc = await payload.create({
      collection: 'media',
      data: { alt: img.alt },
      file: { data, mimetype: 'image/jpeg', name: img.name, size: data.length },
    })
    result[img.name.replace(/^demo-|\.jpg$/g, '')] = { id: doc.id, alt: img.alt }
  }
  for (const img of DEMO_IMAGES) await upload(img)
  return result
}

async function seedForm(payload: Payload): Promise<Id> {
  const form = await payload.create({
    collection: 'forms',
    data: {
      title: FORM_TITLE,
      submitButtonLabel: 'Send message',
      confirmationType: 'message',
      confirmationMessage: lexical(['Thanks for your message. We will reply within one working day.']),
      fields: [
        { blockType: 'text', name: 'name', label: 'Name', required: true, width: 50 },
        { blockType: 'email', name: 'email', label: 'Email', required: true, width: 50 },
        {
          blockType: 'select',
          name: 'topic',
          label: 'Topic',
          required: false,
          options: [
            { label: 'New website', value: 'website' },
            { label: 'Redesign', value: 'redesign' },
            { label: 'Something else', value: 'other' },
          ],
        },
        { blockType: 'textarea', name: 'message', label: 'Message', required: true },
      ],
    },
  })
  return form.id
}

async function seed() {
  const payload = await getPayload({ config })
  payload.logger.info('Seeding demo content…')

  await clear(payload)
  await seedTheme(payload)
  const media = await seedMedia(payload)
  const formId = await seedForm(payload)

  const categoryIds: Id[] = []
  for (const category of CATEGORIES) {
    const doc = await payload.create({ collection: 'categories', data: category })
    categoryIds.push(doc.id)
  }

  // Pass 1: create the pages, so links can reference their IDs.
  const pages: Record<string, Id> = {}
  for (const slug of PAGE_SLUGS) {
    const title = slug === HOME_SLUG ? 'Home' : slug[0].toUpperCase() + slug.slice(1)
    const doc = await payload.create({ collection: 'pages', data: { title, slug, _status: 'published' }, context })
    pages[slug] = doc.id
  }
  const toContact = { label: 'Start a project', link: pageLink(pages.contact) }
  const toServices = { label: 'See our services', link: pageLink(pages.services) }

  // Posts.
  const postBodies = [
    {
      title: 'Designing with blocks',
      excerpt: 'Why we build every page from small, reusable blocks, and what that means for your team.',
      image: media['post-blocks'],
      paragraphs: [
        'A page made of small blocks is easy to change. A heading, a text, a button: each block does one job.',
        'Editors move blocks around in the page builder. Developers add new blocks when the site needs them.',
      ],
      more: 'The best design system is the one your editors actually use.',
    },
    {
      title: 'A faster launch',
      excerpt: 'How ready-made sections cut the time from first sketch to live site.',
      image: media['post-launch'],
      paragraphs: [
        'Most sites need the same sections: a hero, features, a call to action and a contact form.',
        'We start from ready-made sections and change the words, the images and the colors.',
      ],
      more: 'We launched in two weeks instead of two months.',
    },
    {
      title: 'Theme tokens explained',
      excerpt: 'One primary color and one font change the whole site. Here is how theme tokens work.',
      image: media['post-tokens'],
      paragraphs: [
        'The theme settings store a few colors, the fonts and the corner radius.',
        'Every block uses these values through classes like bg-primary, so one change updates every page.',
      ],
      more: 'Change the primary color once, and every button follows.',
    },
  ]
  const posts: Id[] = []
  for (const [i, post] of postBodies.entries()) {
    const slug = POST_SLUGS[i]
    // The post template shows the body with a Field block bound to `content`.
    const body = lexical([
      ...post.paragraphs,
      { h2: 'What we learned' },
      { ul: ['Keep blocks small', 'Reuse sections', 'Let the theme do the styling'] },
      post.more,
    ])
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title: post.title,
        slug,
        excerpt: post.excerpt,
        featuredImage: post.image.id,
        categories: [categoryIds[i % categoryIds.length]],
        publishedAt: new Date(Date.UTC(2026, 8, 10 + i * 7)).toISOString(),
        _status: 'published',
        content: body,
      },
      context,
    })
    posts.push(doc.id)
  }

  // Pass 2: page content.
  const pageLayouts: Record<string, Block[]> = {
    [HOME_SLUG]: [
      hero.create({
        variant: 'home',
        title: 'Websites your team can change in minutes',
        text: `${SITE_NAME} is a small design and development studio. We build fast websites on Payload CMS, and your team edits every page with blocks.`,
        primary: toContact,
        secondary: toServices,
        notes: ['Website design', 'Payload development', 'Launch and editor training'],
      }),
      work.create({
        title: 'Selected work',
        intro: 'A few recent sites. Each one is built from blocks its team edits every week.',
        items: [
          { title: 'Linden Bakery', meta: 'Ordering site and weekly menu · Design and build', image: media['work-bakery'] },
          { title: 'Hale Architects', meta: 'Portfolio and project archive · Design system', image: media['work-architects'] },
          { title: 'Riverside Arts', meta: 'Festival programme and venues · Build and training', image: media['work-festival'] },
          { title: 'Oakmoor Clinic', meta: 'Service pages and online booking · Design and build', image: media['work-clinic'] },
        ],
      }),
      features.create({
        title: 'Why teams choose us',
        intro: 'Three things we care about on every project.',
        items: [
          { title: 'Fast pages', text: 'Server-rendered pages with only the CSS each page needs.' },
          { title: 'Easy editing', text: 'Drag blocks, change text and swap images in a visual builder.' },
          { title: 'Your brand', text: 'Theme colors and fonts flow through every section.' },
        ],
      }),
      imageText.create({
        title: 'A small studio with a big toolbox',
        paragraphs: [
          'We are designers and developers who build on Payload CMS.',
          'Every site we ship comes with ready-made sections your team can reuse.',
        ],
        image: media['studio-desk'],
        action: { label: 'About us', link: pageLink(pages.about) },
      }),
      testimonials.create({
        title: 'What clients say',
        items: [
          { quote: 'Our marketing team builds landing pages on their own now.', cite: 'Maria Lopez, Head of Marketing' },
          { quote: 'The new site loads twice as fast as the old one.', cite: 'Tom Becker, CTO' },
        ],
      }),
      cta.create({
        title: 'Ready to start?',
        text: 'Tell us about your project. We reply within one working day.',
        primary: toContact,
        secondary: { label: 'Read the blog', link: url('/blog') },
      }),
    ],
    about: [
      hero.create({ title: 'About us', text: 'A small team that builds websites people enjoy editing.' }),
      imageText.create({
        title: 'How we started',
        paragraphs: [
          'We spent years building sites that only developers could change.',
          'So we built a page builder on top of Payload CMS, and now our clients edit their own sites.',
        ],
        image: media['workshop-wall'],
        imageRight: true,
      }),
      content.create({
        title: 'How we work',
        body: [
          'Every project starts with a short workshop. We agree on goals, pages and content.',
          { h3: 'Our process' },
          { ul: ['Workshop and sitemap', 'Design in the browser', 'Build with blocks', 'Train your editors'] },
          'After launch, your team owns the site. We stay available for new blocks and features.',
        ],
      }),
      cta.create({ title: 'Work with us', text: 'We take on a few new projects every quarter.', primary: toContact }),
    ],
    services: [
      hero.create({ title: 'Services', text: 'From the first sketch to a site your team runs on its own.', primary: toContact }),
      cardGrid.create({
        title: 'What we do',
        intro: 'Pick one service or combine them.',
        cards: [
          { title: 'Website design', text: 'A clear design system built from theme tokens and blocks.', image: media['post-tokens'] },
          { title: 'Payload development', text: 'Collections, custom blocks and integrations.', image: media['post-blocks'] },
          { title: 'Launch and training', text: 'We launch the site and train your editors.', image: media['post-launch'] },
        ],
      }),
      faq.create({
        title: 'Questions',
        items: [
          { question: 'How long does a project take?', answer: 'Most sites launch in four to eight weeks.' },
          { question: 'Can we edit the site ourselves?', answer: 'Yes. Every page is built with blocks in the visual builder.' },
          { question: 'Do you host the site?', answer: 'We deploy to your server or a VPS of your choice.' },
        ],
      }),
      cta.create({ title: 'Have a project in mind?', text: 'Send us a short message.', primary: toContact }),
    ],
    blog: [
      hero.create({ title: 'Blog', text: 'Notes on design, process and building websites with blocks.' }),
      postList.create({ limit: 12 }),
    ],
    contact: [
      hero.create({ title: 'Contact', text: 'Tell us about your project and we will get back to you.' }),
      contact.create({
        title: 'Get in touch',
        text: 'Fill in the form, or reach us directly. We reply within one working day.',
        formId,
        details: [
          { label: 'Email', value: EMAIL, href: `mailto:${EMAIL}` },
          { label: 'Phone', value: PHONE, href: `tel:${PHONE.replace(/[^+\d]/g, '')}` },
          { label: 'Hours', value: HOURS },
        ],
      }),
    ],
  }
  for (const slug of PAGE_SLUGS) {
    await payload.update({
      collection: 'pages',
      id: pages[slug],
      data: { _status: 'published', builder: layoutOf(pageLayouts[slug], `page "${slug}"`) },
      context,
    })
  }

  // The post template: every post renders through it (posts.template overrides it per post).
  await payload.create({
    collection: 'builder-templates',
    data: {
      name: TEMPLATE_NAME,
      targetCollection: 'posts',
      isDefault: true,
      previewDocument: { relationTo: 'posts', value: posts[0] },
      _status: 'published',
      layout: layoutOf(postTemplate(), 'post template'),
    },
    context,
  })

  // Template parts.
  const nav = [
    { label: 'About', link: pageLink(pages.about) },
    { label: 'Services', link: pageLink(pages.services) },
    { label: 'Blog', link: url('/blog') },
    { label: 'Contact', link: pageLink(pages.contact) },
  ]
  await payload.create({
    collection: 'template-parts',
    data: {
      title: 'Header',
      type: 'header',
      displayCondition: { mode: 'entireSite' },
      _status: 'published',
      builder: layoutOf([header.create({ siteName: SITE_NAME, home: pageLink(pages[HOME_SLUG]), nav, cta: toContact })], 'header'),
    },
    context,
  })
  await payload.create({
    collection: 'template-parts',
    data: {
      title: 'Footer',
      type: 'footer',
      displayCondition: { mode: 'entireSite' },
      _status: 'published',
      builder: layoutOf(
        [
          footer.create({
            siteName: SITE_NAME,
            tagline: 'A small design and development studio. We build websites on Payload CMS that your team can edit.',
            links: [{ label: 'Home', link: pageLink(pages[HOME_SLUG]) }, ...nav],
            contact: { email: EMAIL, phone: PHONE, hours: HOURS },
            copyright: `© ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.`,
          }),
        ],
        'footer',
      ),
    },
    context,
  })

  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      homePage: pages[HOME_SLUG],
      siteName: SITE_NAME,
      siteDescription: 'A small design and development studio that builds fast websites on Payload CMS, which your team edits with blocks.',
    },
    context,
  })

  payload.logger.info(
    `Seeded: theme, ${DEMO_IMAGES.length} images, 1 form, ${CATEGORIES.length} categories, ${PAGE_SLUGS.length} pages, ${posts.length} posts, the post template, header and footer.`,
  )
}

try {
  await seed()
  process.exit(0)
} catch (error) {
  console.error('Seeding failed:', error)
  process.exit(1)
}
