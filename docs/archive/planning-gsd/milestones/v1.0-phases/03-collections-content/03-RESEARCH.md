# Phase 3: Collections & Content - Research

**Researched:** 2026-03-14
**Domain:** Payload CMS v3 collections, versioning, template parts, frontend routing
**Confidence:** HIGH

## Summary

Phase 3 implements all content collections (Pages, Posts, Media, Categories, Tags), a Template Parts collection (replacing traditional Header/Footer globals), and frontend routing. The core Payload features needed -- versions, drafts, autosave, trash, and query presets -- are all stable, well-documented features with straightforward configuration. The most architecturally novel piece is the Template Parts collection with display condition resolution, which has no direct Payload precedent and requires custom design.

The existing block system from Phase 2 (14 atomic blocks, registry, RenderBlocks) provides the foundation. Collections simply reference blocks via `blockReferences` using the established `allBlockSlugs` array. The link field (`src/fields/link.ts`) has an explicit TODO to upgrade its `reference` field from text to a relationship pointing at Pages/Posts -- this must happen in this phase.

**Primary recommendation:** Build collections first (Pages, Posts, Categories, Tags, Template Parts, Media upgrade), then frontend routes, then template part resolution logic. The nested-docs plugin must be installed for Categories but should NOT be applied to Pages (pages use flat slugs with catch-all routing, not hierarchical URLs).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Catch-all route `[...slug]` for maximum URL flexibility (any depth)
- Pages have title + slug fields only (slug uses Payload's built-in slug field)
- No parent page field, no meta description, no featured image as standalone fields (SEO plugin handles meta in Phase 5)
- Homepage: Dedicated global/setting that references a page -- renders at `/`
- URL pattern: `/blog/[slug]` for posts
- Categories collection (hierarchical via Nested Docs plugin) + Tags collection (flat)
- Post fields: title, slug, featured image, excerpt, author (relationship to Users), published date, layout blocks
- Post scheduling: `publishOn` date field for future publishing with draft/publish workflow
- Template Parts collection built using the same nested block system as pages
- Part types: Header, Footer, Custom (freeform type field)
- Display conditions: entire site, specific pages, collection type, exclude pages
- Priority: Most specific condition wins (specific page > collection type > entire site)
- No Header/Footer globals -- template parts replace them entirely
- Root layout.tsx resolves matching template parts (header/footer) based on current route
- Pages: versions (max 50), auto-save (300-350ms), trash (soft delete), query presets
- Posts: versions (max 50), auto-save (300-350ms), trash (soft delete), query presets
- Media: folders, focal point, image sizes -- NO trash, NO versions
- Categories: hierarchical via Nested Docs plugin
- Tags: flat collection
- Template Parts: versions, auto-save, trash, query presets

### Claude's Discretion
- Exact display condition resolution logic (how to efficiently query matching template parts per route)
- Media image sizes configuration (thumbnail, card, hero dimensions)
- How the catch-all route handles 404s
- Post archive page implementation details
- Mega menu block design (or whether to use nested Link blocks instead)

### Deferred Ideas (OUT OF SCOPE)
- Full page templates with dynamic data binding (v2 TMPL-01/TMPL-02) -- template parts for site chrome is Phase 3, but full dynamic templates remain v2
- Sidebar template part type -- could add later when needed

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COLL-01 | Pages collection with block-based layouts | Versions/drafts/autosave config pattern, catch-all routing, slug field, layout blocks field with blockReferences |
| COLL-02 | Posts/Blog collection with categories and tags | Post fields config, relationship fields to Categories/Tags/Users/Media, nested-docs for categories |
| COLL-03 | Media collection with image sizes, focal point, and folders | Existing Media.ts already has focal point and image sizes; needs folders: true confirmation |
| COLL-04 | Navigation globals (header/footer menus) | Replaced by Template Parts collection; display condition architecture, resolution logic |
| COLL-05 | Versions with max 50 versions on Pages and Posts | `versions.maxPerDoc: 50` with `drafts: true`, schedule publish support |
| COLL-06 | Auto-save at 300-350ms interval for live preview support | `versions.drafts.autosave.interval: 300` config |
| COLL-07 | Trash (soft delete) on all main collections except Media | `trash: true` on Pages, Posts, Template Parts; absent on Media |
| COLL-08 | Query presets for all main collections | `enableQueryPresets: true` on collections + root-level `queryPresets` config |

</phase_requirements>

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `payload` | ^3.79.0 | Collection/global definitions, versions, drafts, trash | Already installed, core CMS engine |
| `@payloadcms/next` | ^3.79.0 | Admin panel, preview, catch-all admin routes | Already installed |
| `@payloadcms/db-postgres` | ^3.79.0 | Postgres with blocksAsJSON | Already configured |
| `@payloadcms/richtext-lexical` | ^3.79.0 | Rich text for excerpts, captions | Already configured |

### New Dependencies (Phase 3)

| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| `@payloadcms/plugin-nested-docs` | ^3.79.0 | Hierarchical categories with breadcrumbs | Required for COLL-02 category hierarchy |

### Installation

```bash
pnpm add @payloadcms/plugin-nested-docs
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nested Docs plugin for categories | Manual parent field + beforeChange hook | Plugin handles breadcrumb regeneration, cascade updates automatically. Manual approach is fragile. |
| Template Parts collection | Header/Footer globals | Globals cannot have multiple instances. Template Parts allow multiple headers/footers with conditions. |
| SiteSettings global for homepage | Hardcoded homepage slug check | Global is editable by admins; hardcoded requires code changes |

## Architecture Patterns

### Recommended File Structure (new files for Phase 3)

```
src/
├── collections/
│   ├── Pages.ts                # Pages with layout blocks, versions, trash
│   ├── Posts.ts                # Posts with categories, tags, author
│   ├── Categories.ts           # Hierarchical via nested-docs
│   ├── Tags.ts                 # Flat taxonomy
│   ├── TemplateParts.ts        # Header/Footer/Custom parts with display conditions
│   └── Media.ts                # EXISTING -- upgrade with folders
├── globals/
│   └── SiteSettings.ts         # Homepage page reference
├── fields/
│   ├── link.ts                 # EXISTING -- upgrade reference to relationship
│   └── slug.ts                 # Reusable slug field (optional DRY helper)
├── hooks/
│   ├── populatePublishedAt.ts  # Auto-set published date on first publish
│   ├── revalidatePage.ts       # ISR revalidation afterChange (Phase 4, stub now)
│   └── schedulePublish.ts      # Post scheduling logic
├── utilities/
│   ├── getDocument.ts          # Local API query helpers
│   ├── getGlobals.ts           # Fetch SiteSettings
│   └── resolveTemplateParts.ts # Match template parts to current route
├── app/(frontend)/
│   ├── [...slug]/
│   │   └── page.tsx            # Catch-all page route
│   ├── blog/
│   │   ├── [slug]/
│   │   │   └── page.tsx        # Single post page
│   │   └── page.tsx            # Blog archive/listing
│   └── layout.tsx              # EXISTING -- add template part resolution
└── payload.config.ts           # EXISTING -- add new collections, globals, plugins
```

### Pattern 1: Collection with Versions, Drafts, Autosave, Trash, Query Presets

**What:** Standard collection config pattern used by Pages, Posts, and Template Parts.
**When to use:** Any collection that needs publishing workflow.

```typescript
// Source: Payload official docs + website template
import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'
import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { allBlockSlugs } from '@/blocks/registry'
import type { BlockSlug } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
  },
  versions: {
    maxPerDoc: 50,
    drafts: {
      autosave: {
        interval: 300,
      },
      schedulePublish: true,
    },
  },
  trash: true,
  enableQueryPresets: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: [...allBlockSlugs] as BlockSlug[],
      blocks: [],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
  },
}
```

### Pattern 2: Access Control -- authenticatedOrPublished

**What:** Read access that allows public access to published documents and admin access to drafts.
**When to use:** Pages, Posts, Template Parts -- any versioned collection.

```typescript
// src/access/authenticatedOrPublished.ts
import type { Access } from 'payload'

export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user) return true

  return {
    _status: {
      equals: 'published',
    },
  }
}
```

### Pattern 3: Template Parts with Display Conditions

**What:** Collection where each document declares where it should appear via condition fields.
**When to use:** Template Parts collection only.

```typescript
// src/collections/TemplateParts.ts
export const TemplateParts: CollectionConfig = {
  slug: 'template-parts',
  // ... versions, drafts, autosave, trash, queryPresets same as Pages
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Header', value: 'header' },
        { label: 'Footer', value: 'footer' },
        { label: 'Custom', value: 'custom' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'displayCondition',
      type: 'group',
      fields: [
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'entireSite',
          options: [
            { label: 'Entire Site', value: 'entireSite' },
            { label: 'Specific Pages', value: 'specificPages' },
            { label: 'Collection Type', value: 'collectionType' },
            { label: 'Exclude Pages', value: 'excludePages' },
          ],
        },
        {
          name: 'pages',
          type: 'relationship',
          relationTo: 'pages',
          hasMany: true,
          admin: {
            condition: (_, siblingData) =>
              siblingData?.mode === 'specificPages' || siblingData?.mode === 'excludePages',
          },
        },
        {
          name: 'collectionType',
          type: 'select',
          options: [
            { label: 'All Pages', value: 'pages' },
            { label: 'All Blog Posts', value: 'posts' },
          ],
          admin: {
            condition: (_, siblingData) => siblingData?.mode === 'collectionType',
          },
        },
      ],
    },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: [...allBlockSlugs] as BlockSlug[],
      blocks: [],
    },
  ],
}
```

### Pattern 4: Template Part Resolution Logic

**What:** Server-side function that queries template parts and returns the most specific match for the current route.
**When to use:** Called in root layout.tsx to determine which header/footer to render.

```typescript
// src/utilities/resolveTemplateParts.ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'

type PartType = 'header' | 'footer' | 'custom'

export async function resolveTemplateParts(
  partType: PartType,
  currentPath: string,
  currentCollection?: string,
) {
  const payload = await getPayload({ config: configPromise })

  const { docs: parts } = await payload.find({
    collection: 'template-parts',
    where: {
      type: { equals: partType },
      _status: { equals: 'published' },
    },
    limit: 0, // fetch all (template parts are few)
  })

  // Priority resolution: specific page > collection type > exclude > entire site
  // 1. Check for specific page match
  const specificMatch = parts.find(
    (part) =>
      part.displayCondition?.mode === 'specificPages' &&
      Array.isArray(part.displayCondition.pages) &&
      part.displayCondition.pages.some((p: any) => {
        const slug = typeof p === 'object' ? p.slug : null
        return slug && currentPath === `/${slug}`
      }),
  )
  if (specificMatch) return specificMatch

  // 2. Check for collection type match
  if (currentCollection) {
    const collectionMatch = parts.find(
      (part) =>
        part.displayCondition?.mode === 'collectionType' &&
        part.displayCondition.collectionType === currentCollection,
    )
    if (collectionMatch) return collectionMatch
  }

  // 3. Check for exclude pages (show everywhere except listed pages)
  const excludeMatch = parts.find(
    (part) =>
      part.displayCondition?.mode === 'excludePages' &&
      Array.isArray(part.displayCondition.pages) &&
      !part.displayCondition.pages.some((p: any) => {
        const slug = typeof p === 'object' ? p.slug : null
        return slug && currentPath === `/${slug}`
      }),
  )
  if (excludeMatch) return excludeMatch

  // 4. Fallback to entire site
  const entireSiteMatch = parts.find(
    (part) => part.displayCondition?.mode === 'entireSite',
  )
  return entireSiteMatch || null
}
```

### Pattern 5: Catch-All Page Route

**What:** Next.js dynamic route that resolves any slug to a page from Payload.
**When to use:** `app/(frontend)/[...slug]/page.tsx`

```typescript
// src/app/(frontend)/[...slug]/page.tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string[] }>
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const slugPath = slug?.join('/') || 'home'

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slugPath } },
    limit: 1,
  })

  const page = docs[0]
  if (!page) return notFound()

  return (
    <main>
      <RenderBlocks blocks={page.layout || []} />
    </main>
  )
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    limit: 1000,
    where: { _status: { equals: 'published' } },
    select: { slug: true },
  })
  return docs.map((page) => ({ slug: page.slug ? page.slug.split('/') : [] }))
}
```

### Pattern 6: SiteSettings Global for Homepage

**What:** A global config that stores a reference to the homepage page.
**When to use:** To allow admins to choose which page renders at `/`.

```typescript
// src/globals/SiteSettings.ts
import type { GlobalConfig } from 'payload'
import { authenticated } from '@/access/authenticated'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: {
    read: () => true,
    update: authenticated,
  },
  fields: [
    {
      name: 'homePage',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Home Page',
      admin: {
        description: 'Select the page to display at the root URL (/)',
      },
    },
  ],
}
```

### Pattern 7: Categories with Nested Docs Plugin

**What:** Hierarchical categories using the official nested-docs plugin.
**When to use:** Categories collection only.

```typescript
// Plugin configuration in payload.config.ts
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'

export default buildConfig({
  // ...
  plugins: [
    nestedDocsPlugin({
      collections: ['categories'],
      generateLabel: (_, doc) => doc.title as string,
      generateURL: (docs) =>
        docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
    }),
  ],
})

// src/collections/Categories.ts
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: () => true,
    update: authenticated,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    // parent + breadcrumbs fields are auto-injected by nested-docs plugin
  ],
}
```

### Anti-Patterns to Avoid

- **Applying nested-docs to Pages:** The user explicitly decided on flat slugs with a catch-all route. Pages do NOT have a parent field. Nested-docs is for Categories only.
- **Creating Header/Footer as globals:** User explicitly replaced globals with Template Parts collection. Do NOT create globals/Header.ts or globals/Footer.ts.
- **Hardcoding homepage:** Use a SiteSettings global with a relationship to Pages, not a hardcoded slug check for 'home'.
- **Putting versions on Media:** User explicitly decided Media has NO versions, NO trash. Only folders, focal point, image sizes.
- **Using the Payload slug field type:** Payload has a built-in `type: 'text'` for slugs. The website template uses a custom `slugField()` helper that auto-generates from title. Consider reusing this pattern, but keep it simple -- a text field with `unique: true` works.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hierarchical categories | Manual parent field + recursive breadcrumb hooks | `@payloadcms/plugin-nested-docs` | Handles cascade updates when parent slugs change, breadcrumb regeneration, tree operations |
| Soft delete / trash | Custom `deletedAt` field + filtered queries | Payload's built-in `trash: true` | Handles admin UI trash view, restore, permanent delete access control |
| Draft/publish workflow | Custom `status` field + manual state management | Payload's `versions.drafts` | Handles _status field, admin UI draft indicators, published-only queries |
| Autosave | Custom debounced save logic | Payload's `versions.drafts.autosave` | Integrates with admin panel form state, creates single autosave version |
| Query presets (saved filters) | Custom admin component for filter management | Payload's `enableQueryPresets: true` | Built into admin list view, shareable, database-backed |
| Image resizing | Sharp pipeline in custom hooks | Payload's `upload.imageSizes` | Automatic on upload, focal-point-aware cropping, admin thumbnail |

**Key insight:** Payload v3 has matured to include trash, query presets, and scheduled publishing as first-party features. Everything in this phase's requirements maps directly to built-in Payload config options except the Template Parts display condition resolution.

## Common Pitfalls

### Pitfall 1: Forgetting authenticatedOrPublished Access

**What goes wrong:** Public users can see draft content, or published content is hidden behind login.
**Why it happens:** Using `anyone` for read access exposes drafts. Using `authenticated` hides published pages from anonymous visitors.
**How to avoid:** Create an `authenticatedOrPublished` access function that returns `true` for logged-in users and `{ _status: { equals: 'published' } }` for anonymous.
**Warning signs:** Draft pages visible on public site, or 403 errors when visiting pages without login.

### Pitfall 2: Query Presets Root Config Missing

**What goes wrong:** `enableQueryPresets: true` on a collection but nothing happens.
**Why it happens:** Query presets also need the `queryPresets` property at the root Payload config level.
**How to avoid:** Add `queryPresets: {}` (or with access control) to the root `buildConfig()`.
**Warning signs:** No preset controls appearing in the admin list view.

### Pitfall 3: Nested-Docs Plugin Order in Config

**What goes wrong:** Plugin-injected fields (parent, breadcrumbs) don't appear or conflict with manually defined fields.
**Why it happens:** Nested-docs plugin injects fields into specified collections. If you manually define a `parent` field, it conflicts.
**How to avoid:** Do NOT manually add parent or breadcrumbs fields to Categories. Let the plugin inject them. Only define `title` and `slug`.
**Warning signs:** Duplicate field errors, breadcrumbs not populating.

### Pitfall 4: Template Parts Query Performance

**What goes wrong:** Every page load queries all template parts, slowing down the site.
**Why it happens:** Naive implementation fetches and filters all template parts on every request.
**How to avoid:** Cache template part resolution. Use `unstable_cache` (Next.js) or a simple in-memory cache with revalidation on template part changes. Template parts change rarely.
**Warning signs:** Slow TTFB on all pages, excessive database queries.

### Pitfall 5: Catch-All Route Conflicting with Blog Route

**What goes wrong:** `[...slug]` catches `/blog/some-post` before `blog/[slug]/page.tsx` can handle it.
**Why it happens:** Next.js route matching priority. Catch-all routes are less specific than defined routes.
**How to avoid:** Next.js App Router handles this correctly -- explicit routes (`blog/[slug]`) take priority over catch-all (`[...slug]`). Just make sure the blog route exists as a separate directory.
**Warning signs:** Blog posts rendering the pages collection query instead of posts.

### Pitfall 6: Link Field Upgrade Breaking Existing Data

**What goes wrong:** Changing link.ts `reference` from `type: 'text'` to `type: 'relationship'` breaks existing block data.
**Why it happens:** Existing blocks may have text values in the reference field that don't match relationship IDs.
**How to avoid:** Since this is a starter project without production data, the migration is safe. In a production scenario, you would need a data migration script.
**Warning signs:** Console errors about invalid relationship values.

### Pitfall 7: Post Scheduling Without Jobs Queue

**What goes wrong:** Posts with a future `publishOn` date never actually publish.
**Why it happens:** Payload's `schedulePublish: true` in versions config relies on Payload's Jobs Queue. If jobs are not configured to run, scheduled posts stay as drafts.
**How to avoid:** Use `versions.drafts.schedulePublish: true` which leverages Payload's built-in job scheduling. Ensure the jobs runner is configured (it auto-runs in dev, needs endpoint hit or cron in production).
**Warning signs:** Posts remain in draft state past their scheduled date.

## Code Examples

### Upgrading the Link Field (reference becomes relationship)

```typescript
// src/fields/link.ts -- Phase 3 upgrade
import type { Field } from 'payload'

export const linkFields: Field[] = [
  {
    name: 'type',
    type: 'select',
    label: 'Link Type',
    defaultValue: 'internal',
    options: [
      { label: 'Internal', value: 'internal' },
      { label: 'External', value: 'external' },
    ],
    required: true,
  },
  {
    name: 'url',
    type: 'text',
    label: 'URL',
    required: true,
    admin: {
      condition: (_, siblingData) => siblingData?.type === 'external',
      description: 'Full URL including https://',
    },
  },
  {
    name: 'reference',
    type: 'relationship',
    relationTo: ['pages', 'posts'],
    label: 'Document to link to',
    required: true,
    admin: {
      condition: (_, siblingData) => siblingData?.type === 'internal',
    },
  },
  {
    name: 'label',
    type: 'text',
    label: 'Label',
    required: true,
  },
  {
    name: 'newTab',
    type: 'checkbox',
    label: 'Open in New Tab',
    defaultValue: false,
  },
]
```

### Tags Collection (flat taxonomy)

```typescript
// src/collections/Tags.ts
import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: () => true,
    update: authenticated,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
  ],
}
```

### Posts Collection

```typescript
// src/collections/Posts.ts
import type { CollectionConfig } from 'payload'
import type { BlockSlug } from 'payload'
import { authenticated } from '@/access/authenticated'
import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { allBlockSlugs } from '@/blocks/registry'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
  },
  versions: {
    maxPerDoc: 50,
    drafts: {
      autosave: {
        interval: 300,
      },
      schedulePublish: true,
    },
  },
  trash: true,
  enableQueryPresets: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'excerpt',
      type: 'textarea',
      admin: { description: 'Brief summary for archive listings' },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: [...allBlockSlugs] as BlockSlug[],
      blocks: [],
    },
  ],
}
```

### Media Collection Upgrade

```typescript
// Key changes to existing Media.ts:
// 1. Add folders: true (ALREADY present in existing code)
// 2. focalPoint: true (ALREADY present)
// 3. Image sizes (ALREADY configured well)
// 4. NO versions, NO trash (per user decision)
//
// The existing Media.ts is already well-configured.
// Only minor changes needed: no structural changes required.
```

### Root Layout with Template Part Resolution

```typescript
// src/app/(frontend)/layout.tsx
import { cn } from '@/lib/utils'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { resolveTemplateParts } from '@/utilities/resolveTemplateParts'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { headers } from 'next/headers'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/'

  const headerPart = await resolveTemplateParts('header', pathname)
  const footerPart = await resolveTemplateParts('footer', pathname)

  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        {headerPart?.layout && (
          <header>
            <RenderBlocks blocks={headerPart.layout} />
          </header>
        )}
        {children}
        {footerPart?.layout && (
          <footer>
            <RenderBlocks blocks={footerPart.layout} />
          </footer>
        )}
      </body>
    </html>
  )
}
```

**Note on pathname resolution in layout:** `headers().get('x-pathname')` requires middleware to set the `x-pathname` header. Alternatively, template part resolution can happen in each page component and passed as context -- but this is less DRY. The middleware approach is cleaner:

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  matcher: ['/((?!admin|api|_next/static|_next/image|favicon).*)'],
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom soft delete hooks | `trash: true` collection option | Payload 3.70+ | Built-in trash UI, restore, permanent delete ACL |
| Manual saved filters | `enableQueryPresets: true` | Payload 3.72+ | Database-backed, shareable, admin UI controls |
| Custom scheduled publishing | `versions.drafts.schedulePublish: true` | Payload 3.70+ | Uses Jobs Queue, no custom hooks needed |
| Manual folder upload organization | `folders: true` on collection | Payload 3.60+ | Built-in folder UI, nested folder support |
| Header/Footer as globals | Template Parts collection (custom) | This project's design | Multiple headers/footers with display conditions |

## Open Questions

1. **Pathname access in layout.tsx**
   - What we know: Root layout in App Router does not receive the current pathname as a prop
   - What's unclear: Whether middleware-set headers vs per-page resolution is more reliable with Next.js 16 canary
   - Recommendation: Use middleware to set `x-pathname` header; fallback to per-page template part resolution if issues arise

2. **Template parts caching strategy**
   - What we know: Template parts change rarely but are queried on every page load
   - What's unclear: Whether `unstable_cache` or React `cache()` is more appropriate for this use case
   - Recommendation: Use React `cache()` for request-level deduplication, consider `unstable_cache` with tag-based revalidation for cross-request caching. Add afterChange hook on template-parts to revalidate cache tags.

3. **Mega menu block approach**
   - What we know: Template parts use the same atomic blocks; navigation needs nested link structures
   - What's unclear: Whether nested Link blocks inside a Container are sufficient for mega menus, or if a dedicated nav menu block is needed
   - Recommendation: Start with nested Link/Container blocks. A dedicated nav block can be added in Phase 4 (section presets) if the atomic approach proves insufficient. KISS principle.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 (listed in STACK.md but not yet installed) |
| Config file | None -- see Wave 0 |
| Quick run command | `pnpm vitest run --reporter verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLL-01 | Pages collection exists with layout blocks field, versions, drafts | unit | `pnpm vitest run tests/collections/pages.test.ts -t "Pages" -x` | No -- Wave 0 |
| COLL-02 | Posts collection has categories, tags, author relationships | unit | `pnpm vitest run tests/collections/posts.test.ts -t "Posts" -x` | No -- Wave 0 |
| COLL-03 | Media has folders, focal point, image sizes, no versions/trash | unit | `pnpm vitest run tests/collections/media.test.ts -t "Media" -x` | No -- Wave 0 |
| COLL-04 | Template Parts collection with display conditions | unit | `pnpm vitest run tests/collections/template-parts.test.ts -x` | No -- Wave 0 |
| COLL-05 | Versions maxPerDoc: 50 on Pages and Posts | unit | `pnpm vitest run tests/collections/pages.test.ts -t "versions" -x` | No -- Wave 0 |
| COLL-06 | Autosave interval: 300 on Pages and Posts | unit | `pnpm vitest run tests/collections/pages.test.ts -t "autosave" -x` | No -- Wave 0 |
| COLL-07 | Trash on Pages, Posts, Template Parts; absent on Media | unit | `pnpm vitest run tests/collections/trash.test.ts -x` | No -- Wave 0 |
| COLL-08 | enableQueryPresets on all main collections | unit | `pnpm vitest run tests/collections/query-presets.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest` + `@vitejs/plugin-react` + `vite-tsconfig-paths` -- install as devDependencies
- [ ] `vitest.config.ts` -- configure with path aliases matching tsconfig
- [ ] `tests/collections/pages.test.ts` -- collection config assertions
- [ ] `tests/collections/posts.test.ts` -- collection config assertions
- [ ] `tests/collections/media.test.ts` -- no versions, no trash assertions
- [ ] `tests/collections/template-parts.test.ts` -- display condition fields, type field
- [ ] `tests/collections/trash.test.ts` -- trash enabled/disabled per collection
- [ ] `tests/collections/query-presets.test.ts` -- enableQueryPresets flag assertions
- [ ] `tests/utilities/resolveTemplateParts.test.ts` -- priority resolution logic

## Sources

### Primary (HIGH confidence)
- [Payload Versions Documentation](https://payloadcms.com/docs/versions/overview) -- maxPerDoc, drafts, autosave config
- [Payload Autosave Documentation](https://payloadcms.com/docs/versions/autosave) -- interval property, draft requirement
- [Payload Trash Documentation](https://payloadcms.com/docs/trash/overview) -- trash: true collection option
- [Payload Query Presets Documentation](https://payloadcms.com/docs/query-presets/overview) -- enableQueryPresets, root config
- [Payload Collection Config Documentation](https://payloadcms.com/docs/configuration/collections) -- all collection options
- [Payload Nested Docs Plugin](https://payloadcms.com/docs/plugins/nested-docs) -- generateLabel, generateURL, parent/breadcrumbs injection
- [Payload Website Template (GitHub)](https://github.com/payloadcms/payload/tree/main/templates/website) -- Pages/Posts collection patterns
- [Payload Uploads Documentation](https://payloadcms.com/docs/upload/overview) -- imageSizes, focalPoint, folders

### Secondary (MEDIUM confidence)
- [DeepWiki Payload Versions](https://deepwiki.com/payloadcms/payload/6.3-versions-drafts-and-autosave) -- version config object details
- [Payload Jobs Queue](https://payloadcms.com/docs/jobs-queue/overview) -- scheduled publishing mechanism

### Tertiary (LOW confidence)
- Template parts display condition resolution pattern -- custom design, no Payload precedent. Logic modeled after WordPress/Elementor concepts but implemented from scratch.
- Middleware x-pathname approach for layout pathname access -- common Next.js pattern, needs validation with Next.js 16 canary.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all Payload features are documented and stable
- Architecture: HIGH for collections, MEDIUM for template parts resolution (custom design)
- Pitfalls: HIGH -- common issues well-documented in Payload community

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable Payload features, 30-day window)
