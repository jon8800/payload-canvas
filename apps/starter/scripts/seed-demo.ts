import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

// Seed data uses loose types since block slugs differ at nesting levels
// (e.g., 'container' at top level, 'container_1' at depth 1)
type SeedData = Record<string, any>
import {
  heroPreset,
  contentPreset,
  ctaBannerPreset,
  collectionGridPreset,
  featuresPreset,
  testimonialsPreset,
  faqPreset,
  footerCtaPreset,
} from '@/data/section-presets'
import { richText, populatePresetContent } from './lib/lexical-helpers.js'

async function seed() {
  const payload = await getPayload({ config })
  console.log('Seeding demo content...')

  // --- Categories ---
  const categoryData = [
    { title: 'Technology', slug: 'technology' },
    { title: 'Design', slug: 'design' },
    { title: 'Business', slug: 'business' },
  ] as const

  const categories: Record<string, number> = {}
  for (const cat of categoryData) {
    const created = await (payload as any).create({
      collection: 'categories',
      data: { title: cat.title, slug: cat.slug },
    })
    categories[cat.slug] = created.id as number
  }
  console.log(`Created ${categoryData.length} categories.`)

  // --- Tags ---
  const tagData = [
    { title: 'Tutorial', slug: 'tutorial' },
    { title: 'Guide', slug: 'guide' },
    { title: 'Announcement', slug: 'announcement' },
  ] as const

  const tags: Record<string, number> = {}
  for (const tag of tagData) {
    const created = await (payload as any).create({
      collection: 'tags',
      data: { title: tag.title, slug: tag.slug },
    })
    tags[tag.slug] = created.id as number
  }
  console.log(`Created ${tagData.length} tags.`)

  // --- Template Parts ---
  await (payload as any).create({
    collection: 'template-parts',
    data: {
      title: 'Header',
      type: 'header',
      _status: 'published',
      layout: [
        {
          blockType: 'container',
          htmlTag: 'header' as const,
          display: 'flex',
          justifyContent: 'between',
          alignItems: 'center',
          padding: {
            top: { base: 'custom', custom: 16 },
            right: { base: 'none' },
            bottom: { base: 'custom', custom: 16 },
            left: { base: 'none' },
          },
          maxWidth: 'xl',
          children: [
            {
              blockType: 'heading',
              text: 'My Website',
              tag: 'h3',
            },
            {
              blockType: 'container',
              htmlTag: 'nav' as const,
              display: 'flex',
              customClasses: 'gap-6',
              children: [
                { blockType: 'link', label: 'Home', type: 'internal', doc: null, url: '/' },
                { blockType: 'link', label: 'About', type: 'external', url: '/about' },
                { blockType: 'link', label: 'Blog', type: 'external', url: '/blog' },
                { blockType: 'link', label: 'Contact', type: 'external', url: '/contact' },
              ],
            },
          ],
        },
      ],
    },
  })

  await (payload as any).create({
    collection: 'template-parts',
    data: {
      title: 'Footer',
      type: 'footer',
      _status: 'published',
      layout: [
        {
          blockType: 'container',
          htmlTag: 'footer' as const,
          display: 'flex',
          flexDirection: 'col',
          alignItems: 'center',
          padding: {
            top: { base: 'custom', custom: 32 },
            right: { base: 'none' },
            bottom: { base: 'custom', custom: 32 },
            left: { base: 'none' },
          },
          maxWidth: 'xl',
          backgroundColor: { preset: 'custom', custom: '#f1f5f9' },
          children: [
            {
              blockType: 'paragraph',
              content: richText('Copyright 2026 My Website. All rights reserved.'),
              customClasses: 'text-center text-sm',
            },
            {
              blockType: 'container',
              htmlTag: 'div' as const,
              display: 'flex',
              customClasses: 'gap-4 mt-2',
              children: [
                { blockType: 'link', label: 'Twitter', type: 'external', url: '#' },
                { blockType: 'link', label: 'GitHub', type: 'external', url: '#' },
                { blockType: 'link', label: 'LinkedIn', type: 'external', url: '#' },
              ],
            },
          ],
        },
      ],
    },
  })
  console.log('Created 2 template parts (header, footer).')

  // --- Pages ---

  // Home page
  const homeHero = populatePresetContent(heroPreset.blocks, {
    paragraph: 'Build beautiful, content-managed websites with a composable block system. Choose from pre-built sections or create your own.',
  })
  const homeFeatures = populatePresetContent(featuresPreset.blocks, {
    paragraph: 'Our platform delivers exceptional speed with optimised builds and edge caching for near-instant page loads.',
  })
  const homeGrid = populatePresetContent(collectionGridPreset.blocks, {
    paragraph: 'Explore our latest articles and resources to help you get the most out of the platform.',
  })
  const homeCta = populatePresetContent(ctaBannerPreset.blocks, {
    paragraph: 'Join thousands of developers building modern websites with our composable block-based approach.',
  })

  await (payload as any).create({
    collection: 'pages',
    data: {
      title: 'Home',
      slug: 'home',
      _status: 'published',
      layout: [...homeHero, ...homeFeatures, ...homeGrid, ...homeCta] as any,
    },
  })

  // About page
  const aboutContent = populatePresetContent(contentPreset.blocks, {
    paragraph: 'We believe in making web development accessible. Our block-based approach lets you focus on content while maintaining full design flexibility.',
  })
  const aboutTestimonials = populatePresetContent(testimonialsPreset.blocks, {
    paragraph: 'This platform changed the way we build websites. The composable blocks make it incredibly easy to create consistent, beautiful pages.',
  })

  const aboutCta = populatePresetContent(footerCtaPreset.blocks, {
    paragraph: 'Ready to build your next project? Get started with our composable block system today.',
  })

  await (payload as any).create({
    collection: 'pages',
    data: {
      title: 'About',
      slug: 'about',
      _status: 'published',
      layout: [...aboutContent, ...aboutTestimonials, ...aboutCta] as any,
    },
  })

  // Services page
  const servicesHero = populatePresetContent(heroPreset.blocks, {
    paragraph: 'We offer a comprehensive suite of tools and services to help you build, deploy, and manage your web presence.',
  })
  // Override heading text in cloned hero
  if (servicesHero[0]?.children) {
    const children = servicesHero[0].children as any[]
    const heading = children.find((c) => c.blockType === 'heading')
    if (heading) heading.text = 'Our Services'
  }
  const servicesFeatures = populatePresetContent(featuresPreset.blocks, {
    paragraph: 'Each service is designed to integrate seamlessly with the rest of our platform for a unified development experience.',
  })
  const servicesCta = populatePresetContent(ctaBannerPreset.blocks, {
    paragraph: 'Get in touch with our team to find the right solution for your project needs.',
  })

  await (payload as any).create({
    collection: 'pages',
    data: {
      title: 'Services',
      slug: 'services',
      _status: 'published',
      layout: [...servicesHero, ...servicesFeatures, ...servicesCta] as any,
    },
  })

  // Contact page
  const contactContent = populatePresetContent(contentPreset.blocks, {
    paragraph: 'We would love to hear from you. Whether you have questions about our platform, need technical support, or want to discuss a project, our team is here to help.',
  })
  // Override heading
  if (contactContent[0]?.children) {
    const children = contactContent[0].children as any[]
    const heading = children.find((c) => c.blockType === 'heading')
    if (heading) heading.text = 'Contact Us'
  }

  const contactFaq = populatePresetContent(faqPreset.blocks, {
    paragraph: 'Check our FAQ below for quick answers to common questions about our platform and services.',
  })

  await (payload as any).create({
    collection: 'pages',
    data: {
      title: 'Contact',
      slug: 'contact',
      _status: 'published',
      layout: [...contactContent, ...contactFaq] as any,
    },
  })

  console.log('Created 4 pages (Home, About, Services, Contact).')

  // --- Posts ---
  const postContent = populatePresetContent(contentPreset.blocks, {
    paragraph: 'This is a sample blog post with content generated by the demo seeder.',
  })

  const posts = [
    {
      title: 'Getting Started with Payload CMS',
      slug: 'getting-started-with-payload-cms',
      excerpt: 'Learn how to set up and configure Payload CMS for your next web project with this step-by-step guide.',
      categories: [categories['technology']],
      tags: [tags['tutorial']],
      content: populatePresetContent(contentPreset.blocks, {
        paragraph: 'Payload CMS is a modern, headless content management system built with TypeScript. It provides a powerful admin panel, flexible data modelling, and seamless integration with Next.js. In this guide, we will walk through the initial setup process and explore the key concepts you need to know.',
      }),
    },
    {
      title: 'Building Composable Layouts',
      slug: 'building-composable-layouts',
      excerpt: 'Discover how to create flexible, reusable page layouts using composable blocks and section presets.',
      categories: [categories['design']],
      tags: [tags['guide']],
      content: populatePresetContent(contentPreset.blocks, {
        paragraph: 'Composable layouts let you build pages from reusable blocks rather than monolithic templates. Each block handles a single responsibility -- headings, paragraphs, images, containers, grids -- and can be combined freely. Section presets provide starting points for common layouts like hero sections, feature grids, and call-to-action banners.',
      }),
    },
    {
      title: 'Deploying Your Site',
      slug: 'deploying-your-site',
      excerpt: 'A comprehensive guide to deploying your Payload CMS site with Docker, including database configuration and environment setup.',
      categories: [categories['technology']],
      tags: [tags['guide']],
      content: populatePresetContent(contentPreset.blocks, {
        paragraph: 'Deploying a Payload CMS site involves setting up your database, configuring environment variables, and building the application for production. Docker simplifies this process by packaging everything into reproducible containers. This guide covers the complete deployment workflow from local development to production.',
      }),
    },
    {
      title: 'Introducing Our New Platform',
      slug: 'introducing-our-new-platform',
      excerpt: 'We are excited to announce the launch of our new website platform built on Payload CMS with composable blocks.',
      categories: [categories['business']],
      tags: [tags['announcement']],
      content: populatePresetContent(contentPreset.blocks, {
        paragraph: 'After months of development, we are thrilled to introduce our new website platform. Built on Payload CMS with a composable block system, it gives content teams the flexibility to create beautiful pages without developer intervention. The platform includes pre-built section presets, live preview, and a visual customiser.',
      }),
    },
  ]

  for (const post of posts) {
    await (payload as any).create({
      collection: 'posts',
      data: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        categories: post.categories,
        tags: post.tags,
        _status: 'published',
        layout: post.content as any,
      },
    })
  }
  console.log(`Created ${posts.length} posts.`)

  // Summary
  console.log('\nDemo seeding complete!')
  console.log(`  ${categoryData.length} categories`)
  console.log(`  ${tagData.length} tags`)
  console.log('  2 template parts (header, footer)')
  console.log('  4 pages (Home, About, Services, Contact)')
  console.log(`  ${posts.length} posts`)

  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
