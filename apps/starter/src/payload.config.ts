import { buildConfig } from 'payload'
import type { EmailAdapter } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { searchPlugin } from '@payloadcms/plugin-search'
import nodemailer from 'nodemailer'
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

import { allBlocks } from '@/blocks/registry'
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Categories } from '@/collections/Categories'
import { Tags } from '@/collections/Tags'
import { TemplateParts } from '@/collections/TemplateParts'
import { SiteSettings } from '@/globals/SiteSettings'
import { handleFormEmails } from '@/collections/forms/handleFormEmails'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const smtpAdapter: EmailAdapter = ({ payload }) => {
  const transport = nodemailer.createTransport({
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
  blocks: allBlocks,
  collections: [
    Users,
    Media,
    Pages,
    Posts,
    Categories,
    Tags,
    TemplateParts,
  ],
  globals: [SiteSettings],
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
        hooks: {
          afterChange: [handleFormEmails],
        },
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

    mcpPlugin({
      collections: {
        pages: { enabled: true },
        posts: { enabled: true },
        categories: { enabled: true },
        media: { enabled: { find: true } },
      },
      globals: {
        'site-settings': { enabled: { find: true, update: true } },
      },
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
