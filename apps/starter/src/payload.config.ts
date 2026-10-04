import { sectionLibrary } from './data/sections/library'
import { buildConfig } from 'payload'
import type { EmailAdapter } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { mcpToolkitPlugin } from 'payload-mcp-toolkit'
import { searchPlugin } from '@payloadcms/plugin-search'
import { websiteBuilder, type WebsiteBuilderOptions } from '@payload-toolkit/builder'
import { builderMcpTools } from '@payload-toolkit/builder/mcp'
import typography from '@tailwindcss/typography'
import { createTransport } from 'nodemailer'
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

import { builderBlocks } from '@/builder'
import { documentPath } from '@/lib/links'
import { revalidateTemplate } from '@/hooks/revalidateTemplate'
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Categories } from '@/collections/Categories'
import { Tags } from '@/collections/Tags'
import { TemplateParts } from '@/collections/TemplateParts'
import { SiteSettings } from '@/globals/SiteSettings'
import { ThemeSettings } from '@/globals/ThemeSettings'

/** Collections with the page builder. Shared by the builder plugin and its MCP tools. */
const builderCollections: WebsiteBuilderOptions['collections'] = {
  pages: { field: 'builder', url: (doc) => documentPath('pages', doc.slug) ?? '/' },
  // Posts render through templates (Templates collection): a default "Post template" or the post's own.
  posts: { field: 'builder', url: (doc) => documentPath('posts', doc.slug) ?? '/blog', templates: true },
  'template-parts': { field: 'builder' },
}

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const smtpAdapter: EmailAdapter = ({ payload }) => {
  const transport = createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })

  return {
    defaultFromAddress: process.env.SMTP_FROM || 'noreply@example.com',
    defaultFromName: 'Payload Starter',
    name: 'nodemailer-smtp',
    sendEmail: async (message) => {
      const result = await transport.sendMail(message)
      payload.logger.info({ msg: 'Email sent', messageId: result.messageId })
      return result
    },
  }
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    blocksAsJSON: true,
  }),
  editor: lexicalEditor(),
  email: process.env.SMTP_HOST ? smtpAdapter : undefined,
  collections: [
    Users,
    Media,
    Pages,
    Posts,
    Categories,
    Tags,
    TemplateParts,
  ],
  globals: [SiteSettings, ThemeSettings],
  jobs: {
    autoRun: [{ cron: '*/5 * * * *', queue: 'default' }],
  },
  plugins: [
    nestedDocsPlugin({
      collections: ['categories'],
      generateLabel: (_, doc) => doc.title as string,
      generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
    }),

    seoPlugin({
      collections: ['pages', 'posts'],
      uploadsCollection: 'media',
      tabbedUI: true,
      generateTitle: ({ doc }) => `${doc.title} | Site Name`,
      generateDescription: ({ doc }) => doc.excerpt || '',
      generateURL: ({ doc, collectionConfig }) => {
        const prefix = collectionConfig?.slug === 'posts' ? '/blog' : ''
        return `${process.env.NEXT_PUBLIC_SERVER_URL}${prefix}/${doc.slug}`
      },
    }),

    redirectsPlugin({
      collections: ['pages', 'posts'],
      overrides: {
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: 'isRegex',
            type: 'checkbox',
            label: 'Use Regex Pattern',
            admin: { position: 'sidebar' },
          },
        ],
      },
    }),

    formBuilderPlugin({
      fields: {
        text: true,
        email: true,
        textarea: true,
        select: true,
        checkbox: true,
        number: true,
        message: true,
        country: true,
        state: true,
      },
      redirectRelationships: ['pages'],
      formOverrides: {
        admin: { group: 'Forms' },
      },
      formSubmissionOverrides: {
        admin: { group: 'Forms' },
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: 'attachments',
            type: 'upload',
            relationTo: 'media',
            hasMany: true,
            label: 'File Attachments',
            admin: {
              description: 'Files uploaded with this submission',
            },
          },
        ],
      },
    }),

    importExportPlugin({
      collections: [
        { slug: 'pages' },
        { slug: 'posts' },
        { slug: 'categories' },
        { slug: 'media' },
      ],
    }),

    // AI agents over MCP (POST /api/mcp, keys in MCP → API Keys). The builder tools edit page
    // layouts through the live channel, so an open editor shows each change as it happens.
    mcpToolkitPlugin({
      exclude: {
        collections: ['users', 'form-submissions', 'exports', 'imports', 'search'],
        globals: ['theme-settings'],
      },
      customTools: builderMcpTools({ blocks: builderBlocks, sections: sectionLibrary, collections: builderCollections }),
    }),

    searchPlugin({
      collections: ['pages', 'posts', 'categories'],
      defaultPriorities: { pages: 10, posts: 20, categories: 30 },
      searchOverrides: {
        fields: ({ defaultFields }) => [
          ...defaultFields,
          { name: 'excerpt', type: 'textarea' },
          { name: 'slug', type: 'text' },
        ],
      },
      beforeSync: ({ originalDoc, searchDoc }) => ({
        ...searchDoc,
        excerpt: originalDoc?.excerpt || '',
        slug: originalDoc?.slug || '',
      }),
    }),

    // Must stay last: it adds top-level fields after other plugins (SEO tabbedUI) move fields into tabs.
    websiteBuilder({
      collections: builderCollections,
      blocks: builderBlocks,
      sections: sectionLibrary,
      templates: { hooks: { afterChange: [revalidateTemplate] } },
      // AI assistant in the editor (Claude). Needs ANTHROPIC_API_KEY in .env; see the builder README.
      ai: {},
      css: {
        entry: 'src/app/(frontend)/globals.css',
        plugins: { '@tailwindcss/typography': typography },
      },
    }),
  ],
  queryPresets: {
    access: {
      create: ({ req: { user } }) => Boolean(user),
      read: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user),
    },
    constraints: {},
  },
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
