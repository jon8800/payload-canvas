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
import { fakeAdapter } from '@payload-toolkit/builder/ai/fake'
import { openRouterAdapter } from '@payload-toolkit/builder/ai/openrouter'
import { fakeImageAdapter } from '@payload-toolkit/builder/ai/images/fake'
import { openRouterImageAdapter } from '@payload-toolkit/builder/ai/images/openrouter'
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
import { LegacyPages } from '@/legacy-fixture/collection'
import { LEGACY_COLLECTION, legacyDemo } from '@/legacy-fixture/enabled'
import { legacyBlockConfigs } from '@/legacy-fixture/configs'
import { i18nDemo } from '@/lib/locales'
import { demoLocalization, withoutFieldLocalization } from '@/lib/localizationDemo'

/** Collections with the page builder. Shared by the builder plugin and its MCP tools. */
const builderCollections: WebsiteBuilderOptions['collections'] = {
  pages: { field: 'builder', url: (doc) => documentPath('pages', doc.slug) ?? '/' },
  // Posts render through templates (Templates collection): a default "Post template" or the post's own.
  posts: { field: 'builder', url: (doc) => documentPath('posts', doc.slug) ?? '/blog', templates: true },
  'template-parts': { field: 'builder' },
  // Dev fixture: the old content stays in the `layout` blocks field; the builder gets its own field.
  // `legacyFields`: Publish in the builder keeps the old field's published value.
  ...(legacyDemo
    ? { [LEGACY_COLLECTION]: { field: 'builderLayout', legacyFields: ['layout'], url: (doc) => `/legacy-demo/${String(doc.slug ?? '')}` } }
    : {}),
}

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Who may sign in to the MCP endpoint with their admin login (OAuth). The Users collection has no
// role field: everyone who can open the admin is staff (nobody can sign up; only staff create users).
// To allow fewer people, set MCP_OAUTH_ALLOWED_EMAILS to a comma-separated list of emails.
// To use roles, add a `role` field to Users and check it in `canAuthorize` below.
const mcpOAuthEmails = (process.env.MCP_OAUTH_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

// Fixed callback ports for CLI clients. The toolkit accepts only exact redirect URLs, and
// Claude Code and Codex pick a random port by default: connect with --callback-port (Claude Code)
// or mcp_oauth_callback_port (Codex). See docs/ai/connect-claude-code-and-codex.md.
const MCP_CLAUDE_CODE_CALLBACK = 'http://localhost:8765/callback'
const MCP_CODEX_CALLBACK = 'http://127.0.0.1:8766/callback'
const MCP_HOSTED_CALLBACKS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
]

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
  // Public origin of this server. MCP sign-in (OAuth) needs it: it is the issuer in the discovery
  // documents, and MCP requests must arrive on this host. Run a second dev server on another port
  // with NEXT_PUBLIC_SERVER_URL=http://localhost:<port>.
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
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
    ...(legacyDemo ? [LegacyPages] : []),
  ],
  // Dev fixture: the legacy pages' blocks, referenced by slug (`blockReferences`).
  ...(legacyDemo ? { blocks: legacyBlockConfigs } : {}),
  globals: [SiteSettings],
  // Dev demo of translated pages (BUILDER_I18N_DEMO=1): English and German, /de on the site.
  ...(i18nDemo ? { localization: demoLocalization } : {}),
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
      // "Title | Site name" with the site name from Site Settings; the title alone without one.
      generateTitle: async ({ doc, req }) => {
        const settings = await req.payload.findGlobal({ slug: 'site-settings', depth: 0, req }).catch(() => null)
        const siteName = settings?.siteName?.trim()
        return siteName ? `${doc.title} | ${siteName}` : String(doc.title ?? '')
      },
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
      // Sign in with the admin login: add the URL as an MCP server and approve access. API keys keep working.
      oauth: {
        canAuthorize: ({ user }) =>
          Boolean(user) &&
          user?.collection === Users.slug &&
          (mcpOAuthEmails.length === 0 || mcpOAuthEmails.includes(String((user as { email?: string }).email ?? '').toLowerCase())),
        access: 'editor', // the builder tools edit pages; globals stay read-only, delete stays denied
        redirectURIs: [...MCP_HOSTED_CALLBACKS, MCP_CLAUDE_CODE_CALLBACK, MCP_CODEX_CALLBACK],
      },
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

    // Translation demo: only builder layouts translate (see lib/localizationDemo.ts).
    ...(i18nDemo ? [withoutFieldLocalization] : []),

    // Must stay last: it adds top-level fields after other plugins (SEO tabbedUI) move fields into tabs.
    websiteBuilder({
      collections: builderCollections,
      blocks: builderBlocks,
      sections: sectionLibrary,
      templates: { hooks: { afterChange: [revalidateTemplate] } },
      // AI assistant in the editor. The app picks the adapter from .env: BUILDER_AI_FAKE=1 (dev only)
      // plays a scripted model, OPENROUTER_API_KEY turns on OpenRouter. No adapter: the panel shows the
      // setup card. Other adapters (Anthropic, Cloudflare, any OpenAI-compatible API): docs/ai/providers.md.
      ai: {
        adapter:
          process.env.BUILDER_AI_FAKE === '1' && process.env.NODE_ENV !== 'production'
            ? fakeAdapter()
            : process.env.OPENROUTER_API_KEY
              ? openRouterAdapter({
                  apiKey: process.env.OPENROUTER_API_KEY,
                  model: process.env.OPENROUTER_MODEL,
                  siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
                })
              : null,
        // Image generation (assistant, the inspector's "Generate image", the MCP generateImage tool).
        // Its own adapter, so it works with any chat model and with Claude Code or Codex over MCP.
        // OPENROUTER_IMAGE_MODEL picks the model; BUILDER_AI_FAKE=1 without a key draws local gradients.
        images: process.env.OPENROUTER_API_KEY
          ? openRouterImageAdapter({
              apiKey: process.env.OPENROUTER_API_KEY,
              model: process.env.OPENROUTER_IMAGE_MODEL,
              siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
            })
          : process.env.BUILDER_AI_FAKE === '1' && process.env.NODE_ENV !== 'production'
            ? fakeImageAdapter({ delayMs: 1500 })
            : null,
      },
      css: {
        entry: 'src/app/(frontend)/globals.css',
        plugins: { '@tailwindcss/typography': typography },
      },
      // The Theme global (colors, fonts, radius). Its variables feed the `@theme` in globals.css.
      theme: {
        admin: {
          group: 'Settings',
          livePreview: {
            url: () => `/next/preview?${new URLSearchParams({ slug: 'style-guide', collection: '', path: '/style-guide' })}`,
          },
        },
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
