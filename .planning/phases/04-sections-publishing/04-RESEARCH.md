# Phase 4: Sections & Publishing - Research

**Researched:** 2026-03-14
**Domain:** Payload CMS live preview, Next.js draft mode, on-demand revalidation, sitemap generation, section preset architecture
**Confidence:** HIGH

## Summary

Phase 4 has two distinct workstreams: (1) section presets -- pre-composed arrangements of existing atomic blocks delivered as seed data and admin insertion mechanisms, and (2) the complete publishing workflow including draft mode, live preview, on-demand revalidation, and sitemap/robots.txt generation.

The publishing workflow follows well-established patterns from the official Payload CMS website template. Live preview uses `@payloadcms/live-preview-react` with the `RefreshRouteOnSave` component for server-side rendering in Next.js App Router. Draft mode uses Next.js native `draftMode()` API with a custom preview route handler. Revalidation uses `afterChange` collection hooks calling `revalidatePath` and `revalidateTag` from `next/cache`. Sitemap and robots use Next.js native `sitemap.ts` and `robots.ts` file conventions.

Section presets are NOT new block types. They are pre-configured arrangements of existing atomic blocks (Heading, Paragraph, Button, Image, Container, Grid, etc.) stored as JSON data structures. They are delivered two ways: seed data via `--demo` flag, and an admin preset insertion mechanism that lets editors insert pre-built block arrangements.

**Primary recommendation:** Follow the Payload website template patterns exactly for the publishing workflow (preview route at `/next/preview`, `RefreshRouteOnSave` component, `afterChange` revalidation hooks). For section presets, create JSON data files that define block arrangements and a seed script that uses the Local API.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 8 pre-composed sections: Hero, Content, CTA Banner, Collection Grid, Features, Testimonials, FAQ, Footer CTA
- Each section is an arrangement of existing atomic blocks (Heading, Paragraph, Button, Image, Container, Grid, etc.)
- Dual delivery: seed data (imported via --demo flag in setup script) AND preset insertion in the admin (snippet-style button that inserts pre-configured block arrangements)
- Sections are NOT new block types -- they are saved arrangements of existing blocks
- Hero is just a section preset, not a special field type (confirmed from Phase 1)
- Custom /api/preview route that enables Next.js draft mode and redirects to the page
- Enabled on all content collections with layouts: Pages, Posts, Template Parts
- Uses Payload's built-in live preview with iframe + postMessage
- Auto-save at 300ms (already configured in Phase 3) enables real-time preview updates
- Page + related revalidation strategy: revalidate the changed page/post + archive pages, homepage, and navigation (template parts)
- afterChange hooks on Pages, Posts, Template Parts collections
- Use revalidatePath for specific routes, revalidateTag for grouped content (e.g., 'posts' tag for blog archive)
- Next.js App Router native sitemap.ts and robots.ts
- Sitemap queries all published Pages and Posts
- Robots.txt allows all crawlers by default

### Claude's Discretion
- Exact preset insertion UI mechanism (custom admin component vs Payload's built-in block insertion)
- Sitemap pagination for large sites
- Draft mode cookie handling details
- How live preview resolves template parts in the preview iframe
- Exact revalidation paths for template parts changes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLCK-08 | 5-8 pre-composed section presets (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) | Section preset JSON data structures using existing atomic blocks; seed script pattern; admin insertion mechanism |
| CMS-01 | Draft mode with Next.js preview | Next.js `draftMode()` API, `/next/preview` route handler pattern from Payload website template, `PREVIEW_SECRET` env var |
| CMS-02 | Live Preview in admin panel | `@payloadcms/live-preview-react` with `RefreshRouteOnSave`, `admin.livePreview` config in payload.config.ts, collection-level `admin.livePreview` |
| CMS-03 | On-demand revalidation when content changes | `afterChange` hooks with `revalidatePath`/`revalidateTag`, `context.disableRevalidate` guard, related-page revalidation |
| CMS-04 | Sitemap and robots.txt | Next.js `MetadataRoute.Sitemap` at `app/sitemap.ts`, `MetadataRoute.Robots` at `app/robots.ts` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@payloadcms/live-preview-react` | ^3.79.0 | Server-side live preview with RefreshRouteOnSave | Official Payload package for Next.js App Router SSR live preview |
| `next/cache` | (bundled) | `revalidatePath`, `revalidateTag` | Next.js native on-demand ISR revalidation |
| `next/headers` | (bundled) | `draftMode()` API | Next.js native draft mode for preview |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@payloadcms/live-preview` | ^3.79.0 | Base live preview utilities (`isDocumentEvent`, `ready`) | Only if customizing RefreshRouteOnSave beyond default behavior |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side live preview (RefreshRouteOnSave) | Client-side live preview (useLivePreviewData) | Client-side gives instant updates without round-trip but requires client components; server-side is better for RSC architecture (this project uses RSC) |
| Custom preset insertion UI | Just seed data only | Seed data is simpler but doesn't help editors create new pages; admin insertion provides ongoing value |

**Installation:**
```bash
pnpm add @payloadcms/live-preview-react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (frontend)/
│   │   ├── next/
│   │   │   ├── preview/route.ts       # Enable draft mode + redirect
│   │   │   └── exit-preview/route.ts   # Disable draft mode
│   │   ├── sitemap.ts                  # Dynamic sitemap generation
│   │   ├── robots.ts                   # Robots.txt generation
│   │   ├── [...]slug/page.tsx          # Updated with draft mode support
│   │   ├── blog/[slug]/page.tsx        # Updated with draft mode support
│   │   └── layout.tsx                  # Updated with draft mode awareness
│   └── (payload)/                      # Existing Payload admin routes
├── collections/
│   ├── Pages.ts                        # Add afterChange revalidation hook, livePreview config
│   ├── Posts.ts                        # Add afterChange revalidation hook, livePreview config
│   └── TemplateParts.ts                # Add afterChange revalidation hook, livePreview config
├── hooks/
│   ├── populatePublishedAt.ts          # Existing
│   ├── revalidatePage.ts               # NEW: afterChange hook for Pages
│   ├── revalidatePost.ts               # NEW: afterChange hook for Posts
│   └── revalidateTemplatePart.ts       # NEW: afterChange hook for Template Parts
├── components/
│   └── LivePreviewListener.tsx         # NEW: Client wrapper for RefreshRouteOnSave
├── data/
│   └── section-presets/                # NEW: JSON seed data for section presets
│       ├── hero.ts
│       ├── content.ts
│       ├── cta-banner.ts
│       ├── collection-grid.ts
│       ├── features.ts
│       ├── testimonials.ts
│       ├── faq.ts
│       └── footer-cta.ts
├── scripts/
│   └── seed-demo.ts                    # NEW: Seed script for --demo flag
└── utilities/
    └── generatePreviewPath.ts          # NEW: Preview URL generator
```

### Pattern 1: Preview Route Handler
**What:** A GET route handler that validates the preview secret, authenticates the user, enables draft mode, and redirects to the target page.
**When to use:** Always -- this is required for draft preview and live preview to work.
**Example:**
```typescript
// Source: Payload website template /next/preview/route.ts
import type { CollectionSlug, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import configPromise from '@payload-config'

export async function GET(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { searchParams } = new URL(req.url)

  const path = searchParams.get('path')
  const collection = searchParams.get('collection') as CollectionSlug
  const slug = searchParams.get('slug')
  const previewSecret = searchParams.get('previewSecret')

  if (previewSecret !== process.env.PREVIEW_SECRET) {
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  if (!path || !collection || !slug) {
    return new Response('Insufficient search params', { status: 404 })
  }

  if (!path.startsWith('/')) {
    return new Response('This endpoint can only be used for relative previews', { status: 500 })
  }

  let user
  try {
    user = await payload.auth({
      req: req as unknown as PayloadRequest,
      headers: req.headers,
    })
  } catch (error) {
    payload.logger.error({ err: error }, 'Error verifying token for live preview')
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  const draft = await draftMode()

  if (!user) {
    draft.disable()
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  draft.enable()
  redirect(path)
}
```

### Pattern 2: Live Preview Configuration
**What:** Configure `admin.livePreview` at global and collection levels to enable iframe-based preview in the admin panel.
**When to use:** On all collections with layout blocks (Pages, Posts, Template Parts).
**Example:**
```typescript
// Source: Payload website template payload.config.ts + Pages collection
// In payload.config.ts:
admin: {
  livePreview: {
    breakpoints: [
      { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
      { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
      { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
    ],
  },
}

// In collection config (e.g., Pages.ts):
admin: {
  livePreview: {
    url: ({ data, req }) => generatePreviewPath({
      slug: typeof data?.slug === 'string' ? data.slug : '',
      collection: 'pages',
      req,
    }),
  },
  preview: (data, { req }) => generatePreviewPath({
    slug: typeof data?.slug === 'string' ? data.slug : '',
    collection: 'pages',
    req,
  }),
}
```

### Pattern 3: RefreshRouteOnSave Client Component
**What:** Wraps the `@payloadcms/live-preview-react` component for Next.js App Router.
**When to use:** Rendered conditionally in page components when draft mode is enabled.
**Example:**
```typescript
// Source: Payload live-preview docs (server-side)
'use client'
import { RefreshRouteOnSave as PayloadLivePreview } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

export function LivePreviewListener() {
  const router = useRouter()
  return (
    <PayloadLivePreview
      refresh={() => router.refresh()}
      serverURL={process.env.NEXT_PUBLIC_SERVER_URL || ''}
    />
  )
}
```

### Pattern 4: Revalidation Hooks
**What:** `afterChange` hooks on collections that call `revalidatePath` and `revalidateTag` when documents are published or unpublished.
**When to use:** On Pages, Posts, and Template Parts collections.
**Example:**
```typescript
// Source: Payload website template revalidatePage.ts
import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

export const revalidatePage: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = doc.slug === 'home' ? '/' : `/${doc.slug}`
      payload.logger.info(`Revalidating page at path: ${path}`)
      revalidatePath(path)
      revalidateTag('pages-sitemap')
    }

    // If previously published and now unpublished, revalidate old path
    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = previousDoc.slug === 'home' ? '/' : `/${previousDoc.slug}`
      payload.logger.info(`Revalidating old page at path: ${oldPath}`)
      revalidatePath(oldPath)
      revalidateTag('pages-sitemap')
    }
  }
  return doc
}
```

### Pattern 5: Page Component with Draft Mode
**What:** Page components check `draftMode()` and pass `draft: true` to Payload queries when enabled. Conditionally render `LivePreviewListener`.
**When to use:** All page routes that render Payload content.
**Example:**
```typescript
// Source: Payload website template [slug]/page.tsx
import { draftMode } from 'next/headers'
import { LivePreviewListener } from '@/components/LivePreviewListener'

export default async function Page({ params }: Props) {
  const { isEnabled: draft } = await draftMode()
  // ... query with { draft } flag
  return (
    <>
      {draft && <LivePreviewListener />}
      <main>
        <RenderBlocks blocks={page.layout || []} />
      </main>
    </>
  )
}
```

### Pattern 6: Section Preset Data Structure
**What:** TypeScript files exporting block arrangement arrays that compose atomic blocks into meaningful sections.
**When to use:** For seed data and admin preset insertion.
**Example:**
```typescript
// src/data/section-presets/hero.ts
export const heroPreset = {
  name: 'Hero',
  description: 'Full-width hero section with heading, text, and CTA button',
  blocks: [
    {
      blockType: 'container',
      style: { paddingTop: '80', paddingBottom: '80', backgroundColor: '#f8f9fa' },
      children: [
        {
          blockType: 'heading',
          text: 'Welcome to Your Site',
          settings: { tag: 'h1' },
          style: { textSize: '4xl' },
        },
        {
          blockType: 'paragraph',
          content: { root: { /* Lexical rich text structure */ } },
          style: { textSize: 'lg' },
        },
        {
          blockType: 'button',
          label: 'Get Started',
          link: { type: 'custom', url: '#' },
          style: { /* button styles */ },
        },
      ],
    },
  ],
}
```

### Anti-Patterns to Avoid
- **Creating new block types for sections:** Sections are arrangements of existing atomic blocks, NOT new block types. Do not create HeroBlock, CTABlock, etc.
- **Client-side live preview with RSC:** This project uses server components. Use `RefreshRouteOnSave` (server-side approach), not `useLivePreviewData` (client-side hook).
- **Revalidating on draft saves:** Only revalidate when `_status === 'published'`. Draft saves should NOT trigger revalidation of the live site.
- **Hardcoding preview URLs:** Use `generatePreviewPath` utility to construct preview URLs from slug and collection.
- **Forgetting to handle unpublish:** When a page goes from published to unpublished, the old path must still be revalidated to remove it from cache.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live preview iframe communication | Custom postMessage handling | `@payloadcms/live-preview-react` RefreshRouteOnSave | Handles message parsing, ready signaling, and refresh coordination |
| Draft mode cookies | Manual cookie management | Next.js `draftMode()` API | Handles `__prerender_bypass` cookie securely, regenerates per build |
| Sitemap XML generation | Custom XML builder | Next.js `MetadataRoute.Sitemap` in `sitemap.ts` | Handles XML formatting, content-type headers, proper encoding |
| Robots.txt | Static file | Next.js `MetadataRoute.Robots` in `robots.ts` | Integrates with sitemap URL, handles host detection |
| User authentication in preview | Custom JWT parsing | `payload.auth()` with request headers | Reads payload-token cookie, validates against Payload's auth system |

**Key insight:** The entire publishing workflow has battle-tested implementations in the Payload website template. Follow these patterns rather than innovating.

## Common Pitfalls

### Pitfall 1: Preview route must be under (frontend) group, not (payload)
**What goes wrong:** Preview route placed under `/api/preview` gets caught by Payload's API routing and doesn't work correctly.
**Why it happens:** Payload owns the `/api` path under the `(payload)` route group.
**How to avoid:** Place the preview route at `src/app/(frontend)/next/preview/route.ts` following the official template pattern.
**Warning signs:** 404 errors or Payload API responses when hitting the preview endpoint.

### Pitfall 2: draftMode().enable() before redirect() does not set cookie
**What goes wrong:** Known Next.js issue where `draftMode().enable()` followed by `redirect()` may not persist the cookie.
**Why it happens:** `redirect()` throws an error internally to abort rendering, which can prevent cookie headers from being sent.
**How to avoid:** The Payload website template pattern (enable then redirect) works in current versions but test thoroughly. If issues arise, return a response with manual Set-Cookie header instead.
**Warning signs:** Preview route redirects but page renders published content instead of draft.

### Pitfall 3: Live preview iframe blocked by CORS or CSP
**What goes wrong:** The admin panel iframe cannot load the frontend URL.
**Why it happens:** Since Payload 3 runs in the same Next.js app, this is usually not an issue. But if `NEXT_PUBLIC_SERVER_URL` is misconfigured or the middleware blocks iframe loading, it will fail.
**How to avoid:** Ensure `NEXT_PUBLIC_SERVER_URL` is set correctly (or defaults to `http://localhost:3000`). The existing middleware matcher already excludes `/api` and `/admin` paths.
**Warning signs:** Blank iframe in the admin panel, console errors about frame-ancestors or X-Frame-Options.

### Pitfall 4: Revalidation not working because afterChange fires before DB commit
**What goes wrong:** `revalidatePath` runs but the page still shows old content.
**Why it happens:** The afterChange hook fires synchronously after the change handler but potentially before the database transaction commits.
**How to avoid:** Use `context.disableRevalidate` guard pattern. For critical cases, consider using `afterOperation` hook instead.
**Warning signs:** Intermittent stale content after publishing, especially under load.

### Pitfall 5: Template parts not reflecting in live preview
**What goes wrong:** When editing a template part (header/footer), the live preview iframe does not show the updated template part.
**Why it happens:** Template parts are resolved in `layout.tsx` using React `cache()`. The preview iframe loads the page URL, not the template part URL, so the template part query may not re-run.
**How to avoid:** When previewing template parts, the preview URL should point to a page that uses that template part. The `RefreshRouteOnSave` component triggers `router.refresh()` which re-runs server components including the layout, so this should work if the preview URL is set correctly.
**Warning signs:** Template part changes don't appear in the preview pane.

### Pitfall 6: Section presets with invalid block structure
**What goes wrong:** Seed data fails to insert because the block structure doesn't match the Payload schema.
**Why it happens:** Block data must include `blockType`, valid nested `children` arrays for Container/Grid, and proper field names matching the block configs.
**How to avoid:** Validate preset data against the actual block configs. Test each preset by inserting via the Local API and verifying it renders correctly.
**Warning signs:** Validation errors during seeding, missing blocks in rendered output.

## Code Examples

### Sitemap Generation
```typescript
// Source: Next.js docs + Payload CMS guide
// src/app/(frontend)/sitemap.ts
import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getServerSideURL } from '@/utilities/getURL'
import { unstable_cache } from 'next/cache'

const getCachedSitemap = unstable_cache(
  async () => {
    const payload = await getPayload({ config: configPromise })
    const siteUrl = getServerSideURL()

    const [{ docs: pages }, { docs: posts }] = await Promise.all([
      payload.find({
        collection: 'pages',
        where: { _status: { equals: 'published' } },
        limit: 1000,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        limit: 1000,
        select: { slug: true, updatedAt: true },
      }),
    ])

    const sitemap: MetadataRoute.Sitemap = [
      { url: siteUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ]

    for (const page of pages) {
      sitemap.push({
        url: `${siteUrl}/${page.slug}`,
        lastModified: page.updatedAt ? new Date(page.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    for (const post of posts) {
      sitemap.push({
        url: `${siteUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }

    return sitemap
  },
  ['sitemap'],
  { tags: ['pages-sitemap', 'posts-sitemap'] },
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getCachedSitemap()
}
```

### Robots.txt Generation
```typescript
// src/app/(frontend)/robots.ts
import type { MetadataRoute } from 'next'
import { getServerSideURL } from '@/utilities/getURL'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getServerSideURL()
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
```

### generatePreviewPath Utility
```typescript
// Source: Payload website template
// src/utilities/generatePreviewPath.ts
const collectionPrefixMap: Record<string, string> = {
  pages: '',
  posts: '/blog',
  'template-parts': '',
}

type Props = {
  collection: string
  slug: string
  req?: any
}

export function generatePreviewPath({ collection, slug }: Props): string {
  if (slug === undefined || slug === null) return ''

  const encodedSlug = encodeURIComponent(slug)
  const prefix = collectionPrefixMap[collection] || ''
  const path = slug === 'home' ? '/' : `${prefix}/${encodedSlug}`

  const params = new URLSearchParams({
    slug: encodedSlug,
    collection,
    path,
    previewSecret: process.env.PREVIEW_SECRET || '',
  })

  return `/next/preview?${params.toString()}`
}
```

### Exit Preview Route
```typescript
// Source: Payload website template
// src/app/(frontend)/next/exit-preview/route.ts
import { draftMode } from 'next/headers'

export async function GET(): Promise<Response> {
  const draft = await draftMode()
  draft.disable()
  return new Response('Draft mode is disabled')
}
```

### Revalidation for Template Parts (Custom)
```typescript
// src/hooks/revalidateTemplatePart.ts
import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

export const revalidateTemplatePart: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      // Template parts affect all pages, so revalidate layout
      payload.logger.info(`Revalidating template part: ${doc.title}`)
      revalidatePath('/', 'layout')
      revalidateTag('pages-sitemap')
      revalidateTag('posts-sitemap')
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      payload.logger.info(`Revalidating layout after template part unpublished: ${doc.title}`)
      revalidatePath('/', 'layout')
    }
  }
  return doc
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getStaticProps` + `revalidate` ISR | `revalidatePath`/`revalidateTag` on-demand | Next.js 13+ App Router | Instant cache invalidation instead of time-based |
| Custom preview API routes with `res.setPreviewData()` | `draftMode().enable()` in route handlers | Next.js 13.4+ | Simpler API, automatic cookie management |
| Client-side live preview with `useLivePreviewData` | Server-side `RefreshRouteOnSave` | Payload 3.0 | Works with RSC, no client-side data fetching needed |
| Static `public/sitemap.xml` | Dynamic `app/sitemap.ts` with `MetadataRoute.Sitemap` | Next.js 13.3+ | Auto-generated, cache-aware, supports tags |

**Deprecated/outdated:**
- `res.setPreviewData()` / `res.clearPreviewData()` -- Pages Router only, replaced by `draftMode()` in App Router
- `getStaticProps.revalidate` -- replaced by on-demand revalidation
- `useLivePreviewData` client hook -- still works but not recommended for RSC architectures

## Open Questions

1. **Template Parts preview URL for live preview**
   - What we know: Pages preview to `/{slug}`, Posts to `/blog/{slug}`. Template Parts don't have their own frontend URL.
   - What's unclear: What URL should the live preview iframe load when editing a Template Part?
   - Recommendation: Use the homepage URL (`/`) as the default preview target for template parts, since most template parts (especially headers/footers with "Entire Site" display condition) will be visible there. The `generatePreviewPath` for template-parts collection should return `/` as the path.

2. **Admin preset insertion mechanism**
   - What we know: Users want a way to insert pre-built section arrangements in the admin panel.
   - What's unclear: Payload does not have a built-in "block preset" or "snippet" insertion system. The closest built-in feature is duplicate/copy blocks.
   - Recommendation: For Phase 4, focus on seed data (the `--demo` flag creates a sample homepage with sections). The admin insertion mechanism can be implemented as a custom admin component in a later phase, or documented as a manual workflow where editors duplicate and modify existing section arrangements. This keeps Phase 4 focused and avoids complex custom admin UI work.

3. **PREVIEW_SECRET environment variable**
   - What we know: The preview route validates a `previewSecret` param against `process.env.PREVIEW_SECRET`.
   - What's unclear: This env var doesn't exist yet in the project.
   - Recommendation: Add `PREVIEW_SECRET` to `.env.example` and generate a random value during setup. For development, a simple string works.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not yet configured (no test framework installed) |
| Config file | none -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLCK-08 | Section presets seed correctly and render | manual-only | Manual: run seed script, verify homepage renders 8 sections | No |
| CMS-01 | Draft mode enables via preview route | manual-only | Manual: hit `/next/preview?...`, verify draft cookie set | No |
| CMS-02 | Live preview shows in admin iframe | manual-only | Manual: open admin, toggle live preview on a page | No |
| CMS-03 | Revalidation fires on publish | manual-only | Manual: publish a page, verify path revalidated (check logs) | No |
| CMS-04 | Sitemap returns all published pages/posts | manual-only | Manual: visit `/sitemap.xml`, verify entries | No |

**Justification for manual-only:** All requirements involve browser-based admin panel interaction, iframe rendering, cookie-based draft mode, and ISR cache behavior. These are integration/E2E concerns that require a running server with a database. Unit testing individual hooks (revalidation) would test implementation rather than behavior. The seed script can be tested by running it and verifying output.

### Sampling Rate
- **Per task commit:** Manual smoke test (run dev server, verify feature works)
- **Per wave merge:** Full manual walkthrough of all 5 requirements
- **Phase gate:** All requirements manually verified before `/gsd:verify-work`

### Wave 0 Gaps
None -- all verification is manual for this phase. No test infrastructure needed.

## Sources

### Primary (HIGH confidence)
- Payload CMS Live Preview docs (overview): https://payloadcms.com/docs/live-preview/overview
- Payload CMS Live Preview docs (server-side): https://payloadcms.com/docs/live-preview/server
- Payload website template revalidatePage.ts: https://github.com/payloadcms/payload/blob/main/templates/website/src/collections/Pages/hooks/revalidatePage.ts
- Payload website template revalidatePost.ts: https://github.com/payloadcms/payload/blob/main/templates/website/src/collections/Posts/hooks/revalidatePost.ts
- Payload website template preview route: https://github.com/payloadcms/payload/blob/main/templates/website/src/app/(frontend)/next/preview/route.ts
- Payload website template generatePreviewPath: https://github.com/payloadcms/payload/blob/main/templates/website/src/utilities/generatePreviewPath.ts
- Next.js draftMode() API: https://nextjs.org/docs/app/api-reference/functions/draft-mode
- Next.js sitemap.xml convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js revalidatePath: https://nextjs.org/docs/app/api-reference/functions/revalidatePath
- Next.js revalidateTag: https://nextjs.org/docs/app/api-reference/functions/revalidateTag

### Secondary (MEDIUM confidence)
- Payload CMS admin preview docs: https://payloadcms.com/docs/admin/preview
- Payload CMS sitemap guide: https://payloadcms.com/posts/guides/how-to-build-an-seo-friendly-sitemap-in-payload--nextjs

### Tertiary (LOW confidence)
- Template parts preview URL resolution strategy (recommendation based on reasoning, not official pattern)
- Admin preset insertion mechanism (no official Payload feature exists; recommendation is discretion-based)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official Payload/Next.js packages with clear documentation
- Architecture: HIGH - Patterns directly from the official Payload website template, verified via raw GitHub source
- Pitfalls: MEDIUM - Based on documented issues and reasoning about the specific project architecture
- Section presets: MEDIUM - No established pattern for "block presets" in Payload; the JSON data approach is sound but untested in this exact form

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable patterns, unlikely to change within 30 days)
