# Architecture Research

**Domain:** Composable block-based CMS website starter (Payload CMS v3)
**Researched:** 2026-03-14
**Confidence:** HIGH

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Payload CMS Config Layer                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │  Atomic     │  │  Section   │  │ Collection │  │   Globals    │   │
│  │  Blocks     │  │  Blocks    │  │  Configs   │  │   Configs    │   │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘   │
│        │  composed of   │               │                │           │
│        └────────────────┘               │                │           │
├─────────────────────────────────────────┴────────────────┴───────────┤
│                     Payload Runtime (Next.js API)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Local API   │  │  REST/GQL    │  │  Admin Panel + Plugins   │   │
│  │  (RSC data)  │  │  (external)  │  │  (Layout Customizer)     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘   │
├─────────┴──────────────────┴─────────────────────────────────────────┤
│                     PostgreSQL (Drizzle ORM)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Relational  │  │  JSON Blocks │  │  Media / Uploads         │   │
│  │  Tables      │  │  (JSONB col) │  │  (filesystem/S3)         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────┤
│                     Next.js Frontend (App Router)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Page Routes  │  │  RenderBlocks│  │  Block Components        │   │
│  │  (RSC)       │  │  (mapper)    │  │  (RSC + leaf clients)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Atomic Block Configs | Define smallest reusable content units (Heading, Image, Button, etc.) | Payload Block config objects with `interfaceName` for shared types |
| Section Block Configs | Compose atomic blocks into meaningful page sections (Hero, CTA, FAQ) | Payload Block configs with nested `blocks` field referencing atomic blocks |
| Collection Configs | Define data models (Pages, Posts, Media, Templates, Categories) | Payload Collection configs with blocks fields for layout builder |
| Global Configs | Site-wide data (Header nav, Footer, Site Settings) | Payload Global configs |
| Block Registry | Central map of block slugs to definitions, shared via `blockReferences` | Exported array of block configs, referenced by slug across collections |
| RenderBlocks | Maps block data from API to React components on the frontend | Switch/map component that receives blocks array and renders matching components |
| Block Components | Visual rendering of each block type | React Server Components (client at leaf only) with Tailwind/shadcn |
| Templates Collection | Reusable layouts for dynamic collection pages (single-post, single-product) | Custom collection with blocks field + data binding metadata |
| Data Binding Resolver | Resolves dynamic field references in template blocks to actual collection data | Utility that maps `{{field.title}}` style references to document values |
| Layout Customizer Plugin | Shopify-style visual block editor (external plugin integration point) | Custom Payload admin view with drag-drop, tree view, live preview |

## Recommended Project Structure

```
src/
├── app/
│   ├── (payload)/              # Payload admin routes (auto-generated, do not edit)
│   │   ├── admin/              # Admin panel
│   │   ├── api/                # REST + GraphQL endpoints
│   │   └── layout.tsx          # Payload root layout
│   └── (frontend)/             # Public website routes
│       ├── [slug]/             # Dynamic page routes
│       │   └── page.tsx        # Page renderer (fetches page, renders blocks)
│       ├── posts/
│       │   ├── [slug]/
│       │   │   └── page.tsx    # Single post (uses template or inline layout)
│       │   └── page.tsx        # Posts archive
│       ├── layout.tsx          # Frontend root layout (header/footer globals)
│       └── page.tsx            # Homepage
├── blocks/
│   ├── atomic/                 # Smallest reusable blocks
│   │   ├── Heading/
│   │   │   ├── config.ts       # Payload block config
│   │   │   └── Component.tsx   # Frontend React component
│   │   ├── Paragraph/
│   │   ├── Image/
│   │   ├── Button/
│   │   ├── Container/
│   │   ├── Grid/
│   │   ├── Spacer/
│   │   ├── Divider/
│   │   ├── Video/
│   │   ├── Icon/
│   │   ├── List/
│   │   ├── Blockquote/
│   │   ├── Link/
│   │   └── FormEmbed/
│   ├── sections/               # Pre-composed section blocks
│   │   ├── Hero/
│   │   │   ├── config.ts       # Nested blocks field referencing atomics
│   │   │   └── Component.tsx   # Renders children via RenderBlocks
│   │   ├── Content/
│   │   ├── CTA/
│   │   ├── CollectionGrid/
│   │   ├── Features/
│   │   ├── Testimonials/
│   │   ├── FAQ/
│   │   └── Footer/
│   ├── registry.ts             # Central block registry (all configs exported)
│   └── RenderBlocks.tsx        # Block type -> component mapper
├── fields/
│   ├── styleOptions.ts         # Shared style fields (padding, margin, colors, etc.)
│   ├── settingsTab.ts          # Per-block settings tab factory
│   └── link.ts                 # Reusable link field group
├── collections/
│   ├── Pages.ts                # Pages with layout builder
│   ├── Posts.ts                # Posts with layout builder + categories/tags
│   ├── Media.ts                # Upload collection
│   ├── Categories.ts           # Taxonomy (nested docs)
│   ├── Templates.ts            # Reusable dynamic page templates
│   └── Users.ts                # Admin users
├── globals/
│   ├── Header.ts               # Navigation config
│   ├── Footer.ts               # Footer config
│   └── SiteSettings.ts         # Site-wide settings (optional)
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── Header/                 # Frontend header component
│   ├── Footer/                 # Frontend footer component
│   └── DynamicRenderer/        # Template data binding resolver
├── hooks/
│   ├── revalidatePage.ts       # On-demand ISR revalidation
│   └── populatePublishedAt.ts  # Auto-set publish date
├── utilities/
│   ├── getDocument.ts          # Local API query helpers
│   ├── getGlobals.ts           # Global data fetchers
│   └── resolveBindings.ts      # Template data binding resolution
├── plugins/                    # Plugin integration configs
│   ├── seo.ts                  # @payloadcms/plugin-seo config
│   ├── formBuilder.ts          # @payloadcms/plugin-form-builder config
│   ├── redirects.ts            # @payloadcms/plugin-redirects config
│   └── nestedDocs.ts           # @payloadcms/plugin-nested-docs config
└── payload.config.ts           # Root Payload configuration
```

### Structure Rationale

- **blocks/atomic/ and blocks/sections/:** Co-locates Payload config with frontend component for each block. Atomic blocks are the smallest units; sections compose them. This mirrors the Shopify architecture where sections contain blocks.
- **blocks/registry.ts:** Single source of truth for all block definitions. Collections reference blocks from here via `blockReferences`, keeping configs DRY and TypeScript types clean via `interfaceName`.
- **fields/:** Shared field definitions (style options, settings tabs) used across multiple block configs. Avoids duplicating padding/margin/color field groups in every block.
- **collections/ and globals/:** Separate from blocks because they are distinct Payload concepts. Collections define data models; blocks define composable content units within those models.
- **components/DynamicRenderer/:** Handles the template system's data binding -- resolving template block references to actual collection document data at render time.

## Architectural Patterns

### Pattern 1: Block Composition (Atomic -> Section -> Page)

**What:** Three-tier block hierarchy. Atomic blocks are indivisible content units. Section blocks compose atomics into meaningful groups. Pages/Templates compose sections into full layouts.
**When to use:** Always -- this is the core architectural pattern for the entire system.
**Trade-offs:** More config setup upfront, but maximum flexibility and reusability. Editors can create any layout without developer intervention.

**Example:**
```typescript
// blocks/atomic/Heading/config.ts
import { Block } from 'payload'
import { styleOptions } from '@/fields/styleOptions'

export const HeadingBlock: Block = {
  slug: 'heading',
  interfaceName: 'HeadingBlock',
  fields: [
    { name: 'text', type: 'text', required: true },
    { name: 'tag', type: 'select', options: ['h1','h2','h3','h4','h5','h6'], defaultValue: 'h2' },
    ...styleOptions,
  ],
}

// blocks/sections/Hero/config.ts
import { Block } from 'payload'
import { atomicBlockSlugs } from '@/blocks/registry'
import { styleOptions } from '@/fields/styleOptions'

export const HeroSection: Block = {
  slug: 'heroSection',
  interfaceName: 'HeroSection',
  fields: [
    {
      name: 'blocks',
      type: 'blocks',
      blockReferences: atomicBlockSlugs, // references atomic blocks by slug
      blocks: [],
    },
    ...styleOptions,
  ],
}
```

### Pattern 2: Block Registry with blockReferences

**What:** Define all block configs once in a central registry. Collections reference them by slug using `blockReferences` instead of embedding full configs. Payload generates shared TypeScript types via `interfaceName`.
**When to use:** When blocks are shared across multiple collections (Pages, Posts, Templates all use the same atomic blocks).
**Trade-offs:** Blocks referenced via `blockReferences` cannot be extended per-collection (they are identical everywhere). This is intentional -- consistency is a feature, not a limitation.

**Example:**
```typescript
// blocks/registry.ts
import { HeadingBlock } from './atomic/Heading/config'
import { ParagraphBlock } from './atomic/Paragraph/config'
import { ImageBlock } from './atomic/Image/config'
import { HeroSection } from './sections/Hero/config'
// ... all block imports

// All block configs for Payload's top-level blocks array
export const allBlocks = [
  HeadingBlock, ParagraphBlock, ImageBlock, /* ... all atomics */
  HeroSection, /* ... all sections */
]

// Slug arrays for blockReferences
export const atomicBlockSlugs = ['heading', 'paragraph', 'image', 'button', /* ... */]
export const sectionBlockSlugs = ['heroSection', 'contentSection', 'ctaSection', /* ... */]
export const allBlockSlugs = [...atomicBlockSlugs, ...sectionBlockSlugs]

// payload.config.ts
export default buildConfig({
  blocks: allBlocks, // register all blocks globally
  collections: [/* ... */],
})

// collections/Pages.ts -- references blocks by slug, no config duplication
export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [{
    name: 'layout',
    type: 'blocks',
    blockReferences: allBlockSlugs,
    blocks: [],
  }],
}
```

### Pattern 3: RenderBlocks Component Mapper

**What:** A single component that receives an array of block data from Payload and maps each block's `blockType` to the correct React component for rendering.
**When to use:** Every page/template render. This is the bridge between Payload data and React UI.
**Trade-offs:** Simple and effective. Scales linearly with number of block types. Keep it as a thin mapping layer -- business logic belongs in individual block components.

**Example:**
```typescript
// blocks/RenderBlocks.tsx
import { HeadingComponent } from './atomic/Heading/Component'
import { HeroComponent } from './sections/Hero/Component'

const blockComponents: Record<string, React.FC<any>> = {
  heading: HeadingComponent,
  heroSection: HeroComponent,
  // ... all block mappings
}

export function RenderBlocks({ blocks }: { blocks: any[] }) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map((block, i) => {
        const Component = blockComponents[block.blockType]
        if (!Component) return null
        return <Component key={block.id ?? i} {...block} />
      })}
    </>
  )
}
```

### Pattern 4: Template-Based Dynamic Rendering

**What:** A Templates collection stores reusable layouts with data-binding markers. When rendering a collection item (e.g., a single blog post), the system loads the assigned template, resolves dynamic references (e.g., `{{post.title}}` maps to the post's title field), and renders the result.
**When to use:** When collection items (posts, products) should share a layout designed by content editors, not hardcoded by developers. Inspired by Elementor's template system.
**Trade-offs:** Adds complexity to the rendering pipeline. Requires a binding resolution step. Type-safe binding (only compatible field types can be bound) prevents broken references but requires careful field-type matching logic.

**Example:**
```typescript
// collections/Templates.ts
export const Templates: CollectionConfig = {
  slug: 'templates',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'targetCollection', type: 'select', options: ['posts', 'products'] },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: allBlockSlugs,
      blocks: [],
    },
  ],
}

// utilities/resolveBindings.ts
// At render time, walk the template's block tree.
// For each block field that contains a binding reference like "{{title}}",
// resolve it against the actual document's data.
export function resolveBindings(templateBlocks: any[], document: any): any[] {
  return templateBlocks.map(block => {
    const resolved = { ...block }
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const fieldPath = value.slice(2, -2).trim()
        resolved[key] = getNestedValue(document, fieldPath)
      }
    }
    return resolved
  })
}
```

### Pattern 5: Shared Style Options as Reusable Fields

**What:** Common style properties (padding, margin, background color, text color, border radius, etc.) defined once as a reusable field array, spread into every block config.
**When to use:** Every block that supports visual customization -- which is all of them in this system.
**Trade-offs:** Creates a consistent styling API across all blocks. The frontend must apply these styles uniformly. Keep the style subset small and opinionated (do not try to replicate full CSS -- that is an anti-pattern).

**Example:**
```typescript
// fields/styleOptions.ts
import { Field } from 'payload'

export const styleOptions: Field[] = [
  {
    name: 'style',
    type: 'group',
    admin: { condition: (_, siblingData) => true }, // always show
    fields: [
      { name: 'paddingTop', type: 'select', options: ['none','sm','md','lg','xl'] },
      { name: 'paddingBottom', type: 'select', options: ['none','sm','md','lg','xl'] },
      { name: 'marginTop', type: 'select', options: ['none','sm','md','lg','xl'] },
      { name: 'marginBottom', type: 'select', options: ['none','sm','md','lg','xl'] },
      { name: 'backgroundColor', type: 'text' }, // CSS color or Tailwind class
      { name: 'textColor', type: 'text' },
      { name: 'borderRadius', type: 'select', options: ['none','sm','md','lg','full'] },
      { name: 'customClassName', type: 'text' },
    ],
  },
]
```

## Data Flow

### Page Render Flow (Static Pages)

```
[Browser Request: /about]
    |
[Next.js App Router: app/(frontend)/[slug]/page.tsx]
    |
[Local API: payload.find({ collection: 'pages', where: { slug: 'about' } })]
    |
[PostgreSQL: pages table + JSONB layout column]
    |
[Page Data with blocks array returned]
    |
[RenderBlocks component maps blockType -> React component]
    |
[Each Block Component renders as RSC with Tailwind/shadcn]
    |
[HTML streamed to browser]
```

### Template Render Flow (Dynamic Collection Pages)

```
[Browser Request: /posts/my-post]
    |
[Next.js App Router: app/(frontend)/posts/[slug]/page.tsx]
    |
[Local API: fetch post document AND its assigned template]
    |
[resolveBindings(template.layout, postDocument)]
    |  -- replaces {{title}} with post.title, {{featuredImage}} with post.featuredImage, etc.
    |
[RenderBlocks receives resolved blocks array]
    |
[Same block components render, unaware of template vs. inline layout]
    |
[HTML streamed to browser]
```

### Admin Editing Flow

```
[Admin Panel: /admin/collections/pages/[id]]
    |
[Payload Admin UI renders blocks field with nested block editor]
    |
[Layout Customizer Plugin (optional): tree view + drag-drop + live preview]
    |
[Save: Payload validates block data, stores as JSONB in PostgreSQL]
    |
[afterChange hook: triggers Next.js on-demand revalidation for the page path]
    |
[Frontend serves updated content on next request]
```

### Key Data Flows

1. **Block config -> TypeScript types:** `pnpm payload generate:types` reads block configs with `interfaceName`, generates top-level types per block. Frontend components import these types directly.
2. **Global data (Header/Footer):** Fetched once in the root layout (`app/(frontend)/layout.tsx`) via Local API, passed down to Header/Footer components. Revalidated via afterChange hooks on the globals.
3. **Block style resolution:** Each block component reads its `style` group field and maps values to Tailwind classes (e.g., `paddingTop: 'lg'` becomes `pt-8`). A shared utility function handles this mapping.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Monolith is perfect. Single Next.js + Payload instance. PostgreSQL on same server. No caching needed beyond Next.js built-in. |
| 1k-100k users | Add CDN (Cloudflare/nginx) in front. Enable Next.js ISR with on-demand revalidation. Move media to S3/R2 with CDN. PostgreSQL on managed service. |
| 100k+ users | Add read replicas (Payload postgres adapter supports `readReplicas`). Consider edge caching. Media already on CDN. Rarely needed for CMS-driven sites. |

### Scaling Priorities

1. **First bottleneck: Media delivery.** Images served from origin server will be slow under load. Move to S3/R2 + CDN early (even before 1k users -- it is cheap and simple).
2. **Second bottleneck: Database queries for complex block trees.** JSONB storage helps here -- single column read instead of multi-table joins. For very large sites (1000+ pages), add database query caching or Redis.

## Anti-Patterns

### Anti-Pattern 1: Hardcoded Section Schemas

**What people do:** Create a Hero block with dedicated `title`, `subtitle`, `backgroundImage`, `ctaText`, `ctaLink` fields baked into the block config.
**Why it's wrong:** Every new section variant requires a new block type or adding more fields. Leads to dozens of rigid section types that are 90% similar. Kills composability.
**Do this instead:** Hero is a section block containing a nested `blocks` field. Editors add Heading, Paragraph, Image, Button blocks inside it. The Hero section only controls layout/arrangement, not content.

### Anti-Pattern 2: Duplicating Block Configs Across Collections

**What people do:** Copy-paste block config arrays into Pages, Posts, and Templates collections.
**Why it's wrong:** Config drift, type inconsistency, maintenance nightmare. Change a block in one place, forget the other.
**Do this instead:** Use the block registry pattern. Define blocks once, register globally, reference by slug via `blockReferences`.

### Anti-Pattern 3: Full CSS Property Exposure

**What people do:** Give editors text inputs for arbitrary CSS values (font-size: 14px, margin: 10px 20px 30px 40px).
**Why it's wrong:** Editors will create visually inconsistent pages. Invalid CSS causes rendering bugs. Security risk (CSS injection). Impossible to maintain design system consistency.
**Do this instead:** Expose a constrained set of Tailwind-mapped options (select dropdowns: sm/md/lg/xl). Map these to design tokens. Consistent by construction.

### Anti-Pattern 4: Client Components for Block Rendering

**What people do:** Mark block components with `'use client'` because they are accustomed to client-side React patterns.
**Why it's wrong:** Blocks are primarily data display. Client components increase bundle size, add hydration cost, and lose RSC streaming benefits.
**Do this instead:** Block components should be React Server Components by default. Only add `'use client'` at leaf nodes that genuinely need interactivity (e.g., accordion toggle, carousel, form input).

### Anti-Pattern 5: Storing Blocks Relationally with Deep Nesting

**What people do:** Use the default relational block storage with 3+ levels of nesting.
**Why it's wrong:** Each nesting level creates additional database tables and joins. A page with Section -> Container -> Grid -> Heading generates 4+ tables. Queries become slow and migrations become fragile.
**Do this instead:** Enable `blocksAsJSON: true` in the Postgres adapter config. Stores entire block tree as a single JSONB column. One read, no joins, simpler migrations.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| S3/R2 (media storage) | `@payloadcms/storage-s3` or `@payloadcms/storage-vercel-blob` | Configure in payload.config.ts. Required for production. |
| SMTP (email) | `@payloadcms/email-nodemailer` | For form builder submissions and password resets. |
| Search (optional) | `@payloadcms/plugin-search` | Indexes collection documents for frontend search. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Payload Config <-> Frontend | Local API (direct function call, no HTTP) | In same Next.js process. Use `getPayload()` + `payload.find()` in RSC. |
| Block Configs <-> Block Components | Block registry maps slug to component | RenderBlocks is the bridge. Type safety via generated `interfaceName` types. |
| Templates <-> Collection Documents | resolveBindings utility | Template blocks contain binding markers; resolved at render time against document data. |
| Layout Customizer Plugin <-> Payload Admin | Custom admin view via Payload plugin API | Plugin reads/writes to the same blocks field. Uses Payload's form state context. |
| Payload <-> PostgreSQL | Drizzle ORM (managed by `@payloadcms/db-postgres`) | `blocksAsJSON: true` for block fields. Relational for collections/relationships. |

## Build Order (Dependencies)

The following order reflects what must exist before what:

1. **Payload Config + Database** -- foundation everything else depends on
2. **Shared Fields (styleOptions, link)** -- used by all blocks
3. **Atomic Block Configs** -- smallest units, no dependencies on other blocks
4. **Block Registry** -- aggregates atomics, enables `blockReferences`
5. **Section Block Configs** -- depend on atomic blocks via registry
6. **Collections (Pages, Posts, Media, Categories, Users)** -- depend on block registry
7. **Globals (Header, Footer)** -- independent of blocks, can parallel with #6
8. **RenderBlocks + Block Components** -- frontend rendering, depends on block configs for types
9. **Page Routes (frontend)** -- depends on collections + RenderBlocks
10. **Templates Collection + Data Binding** -- depends on block system being stable
11. **Plugin Integrations (SEO, Forms, Redirects, Nested Docs)** -- can be added incrementally
12. **Layout Customizer Integration** -- depends on stable block system + admin panel
13. **Setup Script + Docker** -- depends on everything else being buildable

## Sources

- [Payload CMS Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks)
- [Payload CMS Postgres Adapter Documentation](https://payloadcms.com/docs/database/postgres)
- [Payload interfaceName Blog Post](https://payloadcms.com/posts/blog/interfacename-generating-composable-graphql-and-typescript-types)
- [Payload Website Template (GitHub)](https://github.com/payloadcms/payload/tree/main/templates/website)
- [Payload blockReferences Documentation](https://github.com/payloadcms/payload/blob/main/docs/fields/blocks.mdx)
- [Payload Advanced Next.js Guide](https://payloadcms.com/posts/guides/learn-advanced-nextjs-with-payloads-website-template)
- [Payload Rendering CMS Data in React](https://payloadcms.com/posts/guides/learn-advanced-nextjs-with-payload-rendering-cms-data-in-react)
- [Creating Flexible Layout Blocks](https://www.scopiousdigital.com/blog/creating-payload-layout-blocks)

---
*Architecture research for: Payload CMS v3 composable block-based website starter*
*Researched: 2026-03-14*
