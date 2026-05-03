# Phase 1: Foundation - Research

**Researched:** 2026-03-14
**Domain:** Payload CMS v3 + Next.js scaffold, PostgreSQL blocksAsJSON, block registry, Tailwind v4 + shadcn/ui, Lexical rich text
**Confidence:** HIGH

## Summary

Phase 1 establishes the project scaffold using `create-payload-app` with the website template, then strips and reconfigures it. The critical technical decisions are: enabling `blocksAsJSON` in the Postgres adapter from day one (cannot be safely retrofitted), establishing the `blockReferences` + `interfaceName` pattern for the block registry, and configuring Tailwind v4 with shadcn/ui.

The Next.js version decision requires attention. The user decided to use "latest Next.js 16", but the official Payload website template ships with Next.js 15.4.11. Payload CMS requires Next.js 16.2.0+ for Next.js 16 compatibility, and 16.2 is currently only available as canary (16.2.0-canary.95 as of 2026-03-12). The latest stable Next.js is 16.1.6, which Payload explicitly does NOT support. **Recommendation: Stay on Next.js 15.4.11 (what the template provides) for stability, or use next@16.2.0-canary.95 if the user insists on Next.js 16 -- but flag this as a risk.**

**Primary recommendation:** Use `create-payload-app -t website` as the starting point, keep Next.js 15.4.11, enable `blocksAsJSON: true` in the Postgres adapter, establish the block registry with `blockReferences` + `interfaceName`, and install all shadcn/ui components upfront.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `create-payload-app` with the website template flag, then strip back
- Remove all 5 existing blocks (Hero, Content, Media, CTA, Archive) -- rebuilding from scratch with atomic system
- Remove their frontend page/post rendering -- building our own RSC block renderers
- Keep useful utilities (generateMeta, mergeOpenGraph, getServerSideURL, etc.)
- Strip dark mode toggle
- Strip hero as separate fields -- hero is just a section block
- Use latest stable Payload version (whatever create-payload-app installs), keep all @payloadcms/* packages in sync
- Use latest Next.js 16 version (not 15.4.x from template)
- Blocks: `src/blocks/` -- co-located with subdirs per block (each block folder contains config.ts, component.tsx, styles.ts)
- Collections: `src/collections/`
- Globals: `src/globals/`
- Shared fields: `src/fields/`
- Single reusable 'styles' group field containing all style properties (padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS)
- Added to every block via the block registry pattern
- Style value input: Hybrid approach -- preset dropdown (sm/md/lg/xl mapped to Tailwind spacing) with a 'custom' option revealing a number input
- Color input: Theme palette presets (shadcn/ui colors) + custom color picker as fallback
- Install ALL shadcn/ui components upfront, strip back later if needed
- Default theme (zinc) as starting point
- Block styles map to Tailwind utility classes on the frontend (e.g., padding 'md' -> 'p-4')

### Claude's Discretion
- Exact files to keep vs strip from the website template (beyond the explicitly mentioned ones)
- Lexical editor configuration details
- blocksAsJSON and blockReferences configuration specifics
- How to handle the Next.js 16 upgrade from the template's Next.js 15

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLCK-09 | Global block references (`blockReferences`) for clean TypeScript schema | Block registry pattern with `buildConfig({ blocks: [...] })` + `blockReferences` array on fields. Use `interfaceName` on every block for clean types. |
| BLCK-10 | Postgres JSON storage for blocks (`blocksAsJSON`) | `blocksAsJSON: true` on `postgresAdapter()` config. Available since Payload v3.60.0. Must be set from day one. |
| CMS-05 | Rich text editor with Lexical | `lexicalEditor()` from `@payloadcms/richtext-lexical`. Default features include bold, italic, underline, strikethrough, link, ordered/unordered list, blockquote, heading, indent, align, inline code, superscript, subscript, relationship, upload, and horizontal rule. |
| DX-05 | Next.js App Router with RSC, client components only at leaf nodes | Template provides App Router structure with `(payload)` and `(frontend)` route groups. Block components are RSC by default. |
| DX-06 | Tailwind v4 + shadcn/ui components | Template ships with Tailwind v4.1.18 + CSS-first config. shadcn/ui init + `add --all` for full component set. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| payload | ^3.79.0 | CMS engine | Latest stable, installed by create-payload-app |
| @payloadcms/next | ^3.79.0 | Next.js integration + admin panel | Required, provides withPayload() wrapper |
| @payloadcms/db-postgres | ^3.79.0 | PostgreSQL via Drizzle ORM | Required for Postgres. Use this, NOT db-vercel-postgres |
| @payloadcms/richtext-lexical | ^3.79.0 | Lexical rich text editor | Only actively maintained RTE. Slate is legacy |
| @payloadcms/ui | ^3.79.0 | Admin panel UI components | Required for admin panel |
| next | 15.4.11 | Full-stack React framework | Template default. See "Next.js Version" section for 16.x analysis |
| react | 19.2.1 | UI library | Required by Next.js 15.4 and Payload v3 |
| tailwindcss | ^4.1.18 | Utility-first CSS | v4 CSS-first config, already in template |
| typescript | 5.7.3 | Type safety | Non-negotiable for Payload's generated types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp | 0.34.2 | Image processing | Required for Next.js image optimization |
| class-variance-authority | ^0.7.0 | Component variants | Core dependency of shadcn/ui |
| clsx | ^2.1.1 | Conditional classnames | Utility for className composition |
| tailwind-merge | ^3.4.0 | Merge Tailwind classes | Resolves conflicting classes in block style system |
| lucide-react | 0.563.0 | Icon library | Default for shadcn/ui |
| tw-animate-css | ^1.4.0 | Animation utilities | Required by shadcn/ui component patterns |
| cross-env | ^7.0.3 | Cross-platform env vars | Required for Windows compatibility |
| geist | ^1.3.0 | Font family | Clean sans-serif default |
| @tailwindcss/postcss | ^4.1.18 | PostCSS plugin | Required for Tailwind v4 with Next.js |
| @tailwindcss/typography | ^0.5.19 | Prose styles | Styles Lexical rich text output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js 15.4.11 | Next.js 16.2.0-canary.95 | Payload 3.73+ supports 16.2+, but only canary is available. Stable 16.1.6 is NOT supported by Payload. Risk: canary builds may have bugs. |
| @payloadcms/db-postgres | @payloadcms/db-vercel-postgres | Only for Vercel serverless. Falls back to pg locally. Project requires VPS/Docker support. |
| Lexical | Slate | Never. Slate is legacy/maintenance-only in Payload v3. |

**Installation:**
```bash
# Scaffold from template
pnpx create-payload-app@latest -t website

# shadcn/ui setup (after scaffold)
pnpx shadcn@latest init --defaults
pnpx shadcn@latest add --all
```

## Next.js Version Decision (CRITICAL)

The user locked "Use latest Next.js 16" but research reveals a compatibility gap:

| Version | Payload Support | Stability | Recommendation |
|---------|----------------|-----------|----------------|
| 15.4.11 | Full support (template default) | Stable, production-ready | SAFEST option |
| 16.1.6 | NOT supported | Stable but Payload breaks | DO NOT USE |
| 16.2.0-canary.95 | Supported (Payload 3.73+) | Canary -- may have bugs | Use if user insists on Next.js 16 |

**Issue:** Payload's `withPayload()` unconditionally injected webpack config that broke Next.js 16 Turbopack (GitHub issue #14354). This was fixed in Payload v3.73+ via PR #14473, but the fix requires Next.js 16.2.0+ specifically.

**Recommendation:** Start with Next.js 15.4.11 from the template. The upgrade path to Next.js 16.2 stable is straightforward when it releases. If the user requires Next.js 16 now, use `next@16.2.0-canary.95` and pin to that exact version. Document this as a known risk.

**Key Next.js 16 breaking changes that affect the project:**
- `middleware.ts` renamed to `proxy.ts` (deprecated but still works)
- Async `params`, `searchParams`, `cookies()`, `headers()` -- must use `await`
- Turbopack is default bundler (webpack via `--webpack` flag)
- Parallel routes require explicit `default.js` files

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)
```
src/
├── app/
│   ├── (payload)/              # Payload admin routes (auto-generated)
│   │   ├── admin/
│   │   ├── api/
│   │   └── layout.tsx
│   └── (frontend)/             # Public website routes
│       ├── layout.tsx          # Root layout with globals
│       └── page.tsx            # Homepage (minimal for Phase 1)
├── blocks/
│   ├── registry.ts             # Central block registry (empty in Phase 1, pattern established)
│   └── RenderBlocks.tsx        # Block type -> component mapper (skeleton)
├── fields/
│   └── styleOptions.ts         # Shared style group field (skeleton for Phase 1)
├── collections/
│   ├── Users.ts                # Admin users (from template)
│   └── Media.ts                # Upload collection (from template, simplified)
├── globals/                    # Empty in Phase 1
├── components/
│   └── ui/                     # shadcn/ui components (installed via CLI)
├── utilities/
│   ├── generateMeta.ts         # Kept from template
│   ├── mergeOpenGraph.ts       # Kept from template
│   └── getServerSideURL.ts     # Kept from template
└── payload.config.ts           # Root config with blocksAsJSON + empty block registry
```

### Pattern 1: Block Registry with blockReferences
**What:** All block configs defined once at the top level of `buildConfig()`. Collections reference them by slug via `blockReferences` instead of embedding configs inline.
**When to use:** Always. This is the foundational pattern.
**Example:**
```typescript
// src/blocks/registry.ts
import type { Block } from 'payload'

// Phase 1: Empty registry, pattern established
export const allBlocks: Block[] = []

// Slug arrays for blockReferences in collection fields
export const atomicBlockSlugs: string[] = []
export const sectionBlockSlugs: string[] = []
export const allBlockSlugs: string[] = [...atomicBlockSlugs, ...sectionBlockSlugs]

// payload.config.ts
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { allBlocks } from '@/blocks/registry'

export default buildConfig({
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    blocksAsJSON: true,
  }),
  editor: lexicalEditor(),
  blocks: allBlocks,
  collections: [/* ... */],
})
```

### Pattern 2: Co-located Block Structure
**What:** Each block is a folder with config.ts (Payload config), component.tsx (React component), and styles.ts (Tailwind class mapping).
**When to use:** Every block (Phase 2+, but folder convention established in Phase 1).
**Example:**
```
src/blocks/
├── Heading/
│   ├── config.ts       # Block definition with interfaceName + fields
│   ├── component.tsx   # RSC that renders the block
│   └── styles.ts       # Maps style field values to Tailwind classes
```

```typescript
// src/blocks/Heading/config.ts (Phase 2 example, pattern documented in Phase 1)
import type { Block } from 'payload'

export const HeadingBlock: Block = {
  slug: 'heading',
  interfaceName: 'HeadingBlock', // Hoisted TypeScript type
  fields: [
    { name: 'text', type: 'text', required: true },
    { name: 'tag', type: 'select', options: ['h1','h2','h3','h4','h5','h6'], defaultValue: 'h2' },
  ],
}
```

### Pattern 3: RenderBlocks Mapper
**What:** Single component that maps blockType to React component.
**When to use:** Every page render.
**Example:**
```typescript
// src/blocks/RenderBlocks.tsx
import type { ReactNode } from 'react'

// Block component registry -- populated in Phase 2
const blockComponents: Record<string, React.ComponentType<any>> = {}

type Props = {
  blocks: Array<{ blockType: string; id?: string; [key: string]: unknown }>
}

export function RenderBlocks({ blocks }: Props): ReactNode {
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

### Anti-Patterns to Avoid
- **Inline block configs in collections:** Never copy block config objects into collection fields. Always use `blockReferences`.
- **Client components for block rendering:** RenderBlocks and static blocks must be RSC. Only interactive leaf components get `'use client'`.
- **tailwind.config.js:** Tailwind v4 uses CSS-first config via `@theme` directive. No JS config file.
- **db:push in development:** Start with migration workflow (`payload migrate:create`) from day one since this is a starter template.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI component library | Custom buttons, inputs, dialogs | shadcn/ui (`pnpx shadcn@latest add --all`) | Accessible, consistent, Tailwind-native |
| Rich text editing | Custom contenteditable editor | `@payloadcms/richtext-lexical` with `lexicalEditor()` | Lexical handles selection, undo/redo, plugins, formatting |
| Database schema management | Manual SQL migrations | `payload migrate:create` + `payload migrate` | Payload generates Drizzle-based migrations from config diffs |
| TypeScript types for blocks | Manual interface definitions | `pnpm payload generate:types` | Auto-generates from block configs with interfaceName |
| CSS class merging | Manual string concatenation | `tailwind-merge` + `clsx` via `cn()` utility | Handles conflicting classes (e.g., `p-4` vs `p-8`) correctly |
| Admin panel theming | Custom admin CSS | Payload's built-in admin panel | Already styled, extensible via custom components |

## Common Pitfalls

### Pitfall 1: Not Enabling blocksAsJSON From Day One
**What goes wrong:** Without `blocksAsJSON: true`, every block type creates its own Postgres table. With 15+ block types across nested sections, this creates dozens of tables with deep JOIN chains. Performance degrades to 10s+ for complex pages.
**Why it happens:** It's the default behavior. Developers don't know to opt in.
**How to avoid:** Set `blocksAsJSON: true` in `postgresAdapter()` config on the very first setup. Cannot be safely switched mid-project without a data migration script.
**Warning signs:** Migration files growing excessively large; slow API responses as content grows.

### Pitfall 2: Missing interfaceName on Block Definitions
**What goes wrong:** Without `interfaceName`, Payload generates collection-scoped types like `Pages_Layout_HeadingBlock` and `Templates_Layout_HeadingBlock` for the same logical block. Frontend components need complex type unions.
**Why it happens:** Payload scopes types to parent collection by default.
**How to avoid:** Set `interfaceName` on every block: `{ slug: 'heading', interfaceName: 'HeadingBlock' }`. Use `Block` suffix to avoid naming collisions with collections.
**Warning signs:** Generated `payload-types.ts` containing duplicate interfaces for the same block.

### Pitfall 3: Mixing db:push and Migrations
**What goes wrong:** Using `db:push` modifies the database without migration files. Later, `payload migrate:create` generates migrations that try to drop/recreate tables that already exist.
**Why it happens:** `db:push` doesn't update migration snapshots.
**How to avoid:** Use `payload migrate:create` + `payload migrate` from the start. Never use `db:push` in this project.
**Warning signs:** Migration files containing DROP TABLE/COLUMN for things that should exist.

### Pitfall 4: shadcn/ui CSS Conflicting with Payload Admin Panel
**What goes wrong:** Tailwind CSS and shadcn/ui styles leak into Payload's admin panel, breaking its layout.
**Why it happens:** Both the frontend and admin panel share the same Next.js app. Global CSS applies everywhere.
**How to avoid:** Payload's admin panel has its own CSS scope. Keep your Tailwind CSS in `(frontend)` layouts only. The template already handles this correctly with separate layout files for `(payload)` and `(frontend)` route groups.
**Warning signs:** Admin panel buttons, inputs, or layout looking wrong after adding Tailwind/shadcn.

### Pitfall 5: Next.js 16 Upgrade Breaking Payload
**What goes wrong:** Upgrading to Next.js 16.1.x stable causes Payload's `withPayload()` to fail because it injects webpack config that conflicts with Turbopack (now default in Next.js 16).
**Why it happens:** Payload requires Next.js 16.2.0+ for Next.js 16 support. The fix (PR #14473) is in Payload 3.73+ but targets 16.2.x.
**How to avoid:** Either stay on Next.js 15.4.11 or use `next@16.2.0-canary.95` with Payload ^3.79.0.
**Warning signs:** Build error: "This build is using Turbopack, with a webpack config and no turbopack config."

## Code Examples

### Payload Config with blocksAsJSON
```typescript
// src/payload.config.ts
// Source: https://payloadcms.com/docs/database/postgres
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import { allBlocks } from '@/blocks/registry'
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    blocksAsJSON: true,
  }),
  editor: lexicalEditor(),
  blocks: allBlocks,
  collections: [Users, Media],
  globals: [],
  sharp,
  typescript: {
    outputFile: 'src/payload-types.ts',
  },
})
```

### Lexical Editor Default Configuration
```typescript
// The default lexicalEditor() includes all standard features:
// Bold, italic, underline, strikethrough, inline code
// Headings, blockquote, ordered/unordered lists
// Links, relationships, uploads
// Horizontal rule, indent, alignment
// Superscript, subscript

// For Phase 1, the default is sufficient:
import { lexicalEditor } from '@payloadcms/richtext-lexical'

export default buildConfig({
  editor: lexicalEditor(), // No custom config needed
  // ...
})

// Per-field override example (if needed later):
{
  name: 'content',
  type: 'richText',
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures],
  }),
}
```

### shadcn/ui cn() Utility
```typescript
// src/lib/utils.ts (created by shadcn init)
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Tailwind v4 CSS-First Configuration
```css
/* src/app/(frontend)/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  /* shadcn/ui zinc theme CSS variables */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  /* ... shadcn generates these during init */
}
```

### Next.js Config with Payload
```typescript
// next.config.ts
import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig = {
  output: 'standalone', // Required for Docker/VPS deployment
  images: {
    remotePatterns: [],
  },
}

export default withPayload(nextConfig)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwind.config.js | CSS-first `@theme` directive | Tailwind v4 (2025) | No JS config file needed |
| Relational block tables | `blocksAsJSON: true` | Payload v3.60.0 | Single JSONB column, no table explosion |
| Inline block configs | `blockReferences` by slug | Payload v3.24.0 | Define blocks once, reference everywhere |
| Slate rich text | Lexical rich text | Payload v3.0 | Better performance, custom block support |
| middleware.ts | proxy.ts | Next.js 16 | Clearer naming (middleware still works) |
| webpack (default) | Turbopack (default) | Next.js 16 | 2-5x faster builds, 10x faster HMR |

**Deprecated/outdated:**
- `@payloadcms/richtext-slate`: Legacy, maintenance-only. Use Lexical.
- `tailwind.config.ts`: Tailwind v4 uses CSS-first config.
- `experimental.ppr`: Removed in Next.js 16, replaced by `cacheComponents`.

## Open Questions

1. **Next.js 16 vs 15.4.11**
   - What we know: Payload requires 16.2.0+ for Next.js 16 support. 16.2 is canary only (no stable release). Template ships with 15.4.11.
   - What's unclear: When Next.js 16.2 will reach stable. Whether user will accept 15.4.11 or insist on canary.
   - Recommendation: Plan for 15.4.11. Include a documented upgrade path task that can be executed when 16.2 goes stable. Flag this for user decision.

2. **blocksAsJSON Migration Path**
   - What we know: Payload provides a predefined migration via `payload migrate:create --file @payloadcms/db-postgres/blocks-as-json` for existing projects.
   - What's unclear: Whether this migration is needed when `blocksAsJSON: true` is set from the initial config before any tables exist.
   - Recommendation: Set `blocksAsJSON: true` before running first migration. If the template creates initial tables first, run the predefined migration immediately after.

3. **Which Template Files to Keep vs Strip**
   - What we know: Keep utilities (generateMeta, mergeOpenGraph, getServerSideURL). Strip all 5 blocks, frontend pages, dark mode toggle, hero fields.
   - What's unclear: Exact file inventory of the template (varies by version).
   - Recommendation: Run create-payload-app, audit file tree, categorize each file as keep/strip/modify. This is a planner task, not a research gap.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + @testing-library/react 16.3.0 |
| Config file | None -- Wave 0 must create vitest.config.ts |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLCK-09 | Block registry exports allBlocks array; blockReferences used in collection fields | unit | `pnpm vitest run src/blocks/registry.test.ts -t "registry"` | No -- Wave 0 |
| BLCK-10 | Postgres adapter configured with blocksAsJSON: true | unit | `pnpm vitest run src/payload.config.test.ts -t "blocksAsJSON"` | No -- Wave 0 |
| CMS-05 | Lexical editor configured and functional | smoke (manual) | Manual: visit /admin, create content with rich text | Manual-only: requires running CMS |
| DX-05 | App Router RSC architecture with (frontend) route group | unit | `pnpm vitest run src/app/__tests__/routes.test.ts` | No -- Wave 0 |
| DX-06 | Tailwind v4 + shadcn/ui render correctly | smoke (manual) | Manual: verify shadcn Button renders with correct styles | Manual-only: visual verification |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + manual smoke tests before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- Vitest configuration with jsdom environment
- [ ] `src/blocks/registry.test.ts` -- Tests block registry exports
- [ ] `src/payload.config.test.ts` -- Tests payload config has blocksAsJSON: true
- [ ] Framework install: `pnpm add -D vitest jsdom @testing-library/react @vitejs/plugin-react vite-tsconfig-paths`

## Sources

### Primary (HIGH confidence)
- [Payload CMS Postgres Documentation](https://payloadcms.com/docs/database/postgres) -- blocksAsJSON config
- [Payload CMS Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks) -- blockReferences, interfaceName
- [Payload Website Template package.json](https://github.com/payloadcms/payload/blob/main/templates/website/package.json) -- verified Next.js 15.4.11, React 19.2.1, Tailwind 4.1.18
- [Payload CMS GitHub Releases](https://github.com/payloadcms/payload/releases) -- latest version 3.79.0
- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16) -- breaking changes, Turbopack default, proxy.ts
- [GitHub Issue #14354](https://github.com/payloadcms/payload/issues/14354) -- withPayload webpack/Turbopack fix, resolved via PR #14473
- [shadcn/ui CLI docs](https://ui.shadcn.com/docs/cli) -- `add --all` flag for installing all components

### Secondary (MEDIUM confidence)
- [Build with Matija: Payload + Next.js 16](https://www.buildwithmatija.com/blog/payload-cms-nextjs-16-compatibility-breakthrough) -- Payload requires Next.js 16.2.0+ or 16.1.1-canary.35+
- [Payload Discussion #14330](https://github.com/payloadcms/payload/discussions/14330) -- Next.js 16 support timeline and requirements
- [npm: next versions](https://www.npmjs.com/package/next) -- latest stable 16.1.6, latest canary 16.2.0-canary.95

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified from template package.json and official docs
- Architecture: HIGH -- patterns from official docs and prior project research
- Pitfalls: HIGH -- confirmed via GitHub issues and official documentation
- Next.js 16 compatibility: MEDIUM -- canary-only situation may change quickly

**Research date:** 2026-03-14
**Valid until:** 2026-03-28 (14 days -- Next.js 16.2 stable could release any time)
