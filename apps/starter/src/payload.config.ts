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
import { websiteBuilder, type WebsiteBuilderOptions } from 'payload-canvas'
// @feature:ai
import { fakeAdapter } from 'payload-canvas/ai/fake'
import { openRouterAdapter } from 'payload-canvas/ai/openrouter'
import { fakeImageAdapter } from 'payload-canvas/ai/images/fake'
import { openRouterImageAdapter } from 'payload-canvas/ai/images/openrouter'
// @end:ai
import { builderMcpTools } from 'payload-canvas/mcp'
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
import { SharedBlocksPages } from '@/legacy-fixture/sharedCollection'
import { LEGACY_COLLECTION, legacyDemo, SHARED_BLOCKS_COLLECTION } from '@/legacy-fixture/enabled'
import { legacyBlockConfigs } from '@/legacy-fixture/configs'
import { i18nDemo } from '@/lib/locales'
import { demoLocalization, withoutFieldLocalization } from '@/lib/localizationDemo'
// @feature:dashboard
import { dashboard } from '@/admin/dashboard'
// @end:dashboard
import { isDesigner } from '@/access/roles'
// @feature:look
import { statusBadges } from '@/admin/list/statusBadges'
// @end:look

/** Collections with the page builder. Shared by the builder plugin and its MCP tools. */
const builderCollections: WebsiteBuilderOptions['collections'] = {
  pages: { field: 'builder', url: (doc) => documentPath('pages', doc.slug) ?? '/' },
  // Posts render through templates (Templates collection): a default "Post template" or the post's own.
  posts: { field: 'builder', url: (doc) => documentPath('posts', doc.slug) ?? '/blog', templates: true },
  'template-parts': { field: 'builder' },
  // Dev fixtures for existing Payload blocks.
  // - One source of truth: the builder edits the collection's own `layout` blocks field.
  // - Opt-in copy: the old content stays in `layout`, and the builder gets its own JSON field.
  //   `legacyFields`: Publish in the builder keeps the old field's published value.
  ...(legacyDemo
    ? {
        [SHARED_BLOCKS_COLLECTION]: { field: 'layout', url: (doc) => `/legacy-demo/shared/${String(doc.slug ?? '')}` },
        [LEGACY_COLLECTION]: { field: 'builderLayout', legacyFields: ['layout'], url: (doc) => `/legacy-demo/${String(doc.slug ?? '')}` },
      }
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

// Development only: the admin opens signed in as this user, with no login form. Set
// DEV_AUTOLOGIN_EMAIL in .env (the dev user from scripts/_dev-user.ts: builder-dev@local.test).
// Payload then treats every request without a login cookie as this user, so it never runs in production.
const devAutoLogin =
  process.env.NODE_ENV === 'development' && process.env.DEV_AUTOLOGIN_EMAIL
    ? { email: process.env.DEV_AUTOLOGIN_EMAIL }
    : false

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
    autoLogin: devAutoLogin,
    components: {
      // @feature:nav
      // The sidebar: grouped collections and globals with icons (src/admin/nav).
      Nav: '/admin/nav/Nav#Nav',
      // @end:nav
      // @feature:look
      // The brand on the login page and in the header. Change it in src/admin/brand (brand.ts, Mark.tsx).
      graphics: {
        Logo: '/admin/brand/Logo#Logo',
        Icon: '/admin/brand/Icon#Icon',
      },
      beforeLogin: ['/admin/brand/Welcome#Welcome'],
      // @end:look
    },
    // @feature:dashboard
    // Dashboard widgets (src/admin/dashboard). Each user can rearrange them with "Edit dashboard".
    dashboard,
    // @end:dashboard
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
    ...(legacyDemo ? [LegacyPages, SharedBlocksPages] : []),
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
        admin: { useAsTitle: 'from', defaultColumns: ['from', 'to', 'isRegex', 'updatedAt'] },
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
        admin: { group: 'Forms', defaultColumns: ['title', 'fields', 'confirmationType', 'updatedAt'] },
      },
      formSubmissionOverrides: {
        admin: { group: 'Forms', defaultColumns: ['form', 'submissionData', 'createdAt'] },
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
      // Opening a saved page or post goes straight to the visual builder. "All fields" in the builder's menu opens the form.
      // Users with the Editor role get content mode: they change text, images and links, not the design.
      editor: { openInBuilder: true, canEditDesign: ({ user }) => isDesigner(user) },
      // @feature:ai
      // AI assistant in the editor. BUILDER_AI_FAKE=1 (dev only) plays a scripted model. Else OpenRouter:
      // the key comes from OPENROUTER_API_KEY, or an admin pastes one in the "AI settings" global
      // (that key wins). Without either, the panel shows the setup card with a link to the settings.
      // Other adapters (Anthropic, Cloudflare, any OpenAI-compatible API): docs/ai/providers.md.
      ai: {
        adapter:
          process.env.BUILDER_AI_FAKE === '1' && process.env.NODE_ENV !== 'production'
            ? fakeAdapter()
            : openRouterAdapter({
                apiKey: process.env.OPENROUTER_API_KEY,
                model: process.env.OPENROUTER_MODEL,
                siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
              }),
        // Image generation (assistant, the inspector's "Generate image", the MCP generateImage tool).
        // Its own adapter, so it works with any chat model and with Claude Code or Codex over MCP.
        // It shares the OpenRouter key (one field in AI settings). OPENROUTER_IMAGE_MODEL picks the
        // model; BUILDER_AI_FAKE=1 without a key draws local gradients.
        images:
          process.env.BUILDER_AI_FAKE === '1' && process.env.NODE_ENV !== 'production' && !process.env.OPENROUTER_API_KEY
            ? fakeImageAdapter({ delayMs: 1500 })
            : openRouterImageAdapter({
                apiKey: process.env.OPENROUTER_API_KEY,
                model: process.env.OPENROUTER_IMAGE_MODEL,
                siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
              }),
      },
      // @end:ai
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

    // @feature:look
    // List views: the Status column as a coloured badge. After websiteBuilder, so its Templates and
    // Classes get the badge too. It only adds a list cell (src/admin/list/statusBadges.ts).
    statusBadges(),
    // @end:look
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
