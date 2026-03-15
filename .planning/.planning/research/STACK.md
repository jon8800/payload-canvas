# Stack Research

**Domain:** Payload CMS v3 website starter with composable block architecture
**Researched:** 2026-03-14
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Payload CMS | ^3.79.0 | Headless CMS + backend framework | The only CMS that installs directly into a Next.js app folder. Native TypeScript, config-as-code, block fields with `blockReferences` for clean schemas, `blocksAsJSON` Postgres option for nested block performance. No other CMS offers this level of Next.js integration. |
| Next.js | 15.4.11 | Full-stack React framework | Payload's official website template currently pins to 15.4.11. Next.js 16 support landed in Payload 3.73+ but requires canary/16.2+ builds -- too bleeding-edge for a starter. Stick with 15.4.x for stability. |
| React | 19.2.1 | UI library | Required by Next.js 15.4 and Payload v3. Includes Server Components, Actions, and `use()` hook. |
| PostgreSQL | 16+ | Primary database | Project requirement. Payload's Postgres adapter uses Drizzle ORM under the hood. The `blocksAsJSON` option stores deeply nested blocks as JSON columns instead of relational tables -- critical for this project's composable block architecture. |
| Tailwind CSS | ^4.1.18 | Utility-first CSS | v4 uses CSS-first configuration (no `tailwind.config.js`), native `@theme` directive, 5x faster builds. The official Payload website template already uses v4. |
| TypeScript | 5.7.3 | Type safety | Payload generates types from your config. TypeScript is non-negotiable -- the entire value of Payload's block system depends on generated types. |

### Payload Packages (all pinned to same version)

| Package | Purpose | Why Needed |
|---------|---------|------------|
| `payload` | Core CMS engine | Required |
| `@payloadcms/next` | Next.js integration, admin panel routing | Required -- provides `withPayload()` next.config wrapper and admin panel |
| `@payloadcms/db-postgres` | PostgreSQL adapter via Drizzle ORM + node-postgres | Use this, NOT `@payloadcms/db-vercel-postgres` -- the Vercel variant is optimized for serverless and falls back to `pg` locally anyway. `db-postgres` works everywhere. |
| `@payloadcms/richtext-lexical` | Rich text editor | Lexical is the only actively maintained Payload rich text editor. Slate adapter exists but is legacy. Lexical supports custom blocks inside rich text. |
| `@payloadcms/ui` | Admin panel UI components | Required for admin panel and any custom admin views (like the Layout Customizer plugin) |
| `@payloadcms/live-preview-react` | Live preview in admin | Enables real-time preview as editors type. Supports server components in v3. Essential for a block-based editing experience. |
| `@payloadcms/plugin-seo` | SEO metadata fields | Injects title, description, Open Graph fields into collections. Table stakes for any website. |
| `@payloadcms/plugin-form-builder` | Form creation in admin | Lets editors build forms without developer intervention. Required per project spec. |
| `@payloadcms/plugin-redirects` | URL redirect management | Manages 301/302 redirects from admin panel. Essential for SEO when URLs change. |
| `@payloadcms/plugin-nested-docs` | Hierarchical document support | Adds breadcrumbs and parent/child relationships. Needed for nested page structures. |
| `@payloadcms/plugin-search` | Search indexing | Syncs collection data into a search-optimized collection. Used by the official website template. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | 0.34.2 | Image processing | Required for Next.js image optimization in production. Handles resize, WebP/AVIF conversion. Must be in dependencies, not devDependencies. |
| `geist` | ^1.3.0 | Font family | Clean, modern sans-serif font by Vercel. Default in the Payload website template. Replace with project-specific fonts if needed. |
| `class-variance-authority` | ^0.7.0 | Component variants | Creates type-safe component variant APIs. Core dependency of shadcn/ui pattern. |
| `clsx` | ^2.1.1 | Conditional classnames | Lightweight className utility. Pairs with `tailwind-merge`. |
| `tailwind-merge` | ^3.4.0 | Merge Tailwind classes | Resolves conflicting Tailwind classes intelligently. Essential when composing block styles from multiple sources. |
| `lucide-react` | 0.563.0 | Icon library | Default icon set for shadcn/ui. Tree-shakeable, consistent design. |
| `react-hook-form` | 7.71.1 | Form state management | Used by Payload's form builder plugin on the frontend. Lightweight, performant. |
| `next-sitemap` | ^4.2.3 | Sitemap generation | Auto-generates sitemap.xml and robots.txt. Important for SEO. |
| `graphql` | ^16.8.2 | GraphQL client | Payload auto-generates a GraphQL API. Include if you want GraphQL queries alongside REST. Optional -- REST is sufficient for most use cases. |
| `cross-env` | ^7.0.3 | Cross-platform env vars | Sets environment variables in npm scripts across Windows/Mac/Linux. Required per project's cross-platform constraint. |
| `dotenv` | 16.4.7 | Environment loading | Loads .env files. Used by setup scripts and seed commands. |
| `prism-react-renderer` | ^2.3.1 | Code syntax highlighting | For rendering code blocks in rich text content. Only needed if blog/docs content includes code snippets. |
| `tw-animate-css` | ^1.4.0 | Tailwind animation utilities | Provides animation classes for shadcn/ui components. Required by shadcn's newer component patterns. |

### shadcn/ui (Component System)

shadcn/ui is not a versioned npm package -- it is a code distribution system. Components are copied into your project via CLI.

| Aspect | Detail |
|--------|--------|
| CLI version | shadcn@latest (CLI v4 as of March 2026) |
| Init command | `pnpx shadcn@latest init` |
| Base UI library | Radix UI (default) or Base UI (selectable via `--base` flag) |
| Key components to install | `button`, `input`, `select`, `checkbox`, `label`, `dialog`, `dropdown-menu`, `sheet`, `tabs`, `accordion`, `card`, `badge`, `separator`, `skeleton`, `tooltip` |
| CSS variables | Uses Tailwind v4 `@theme` with CSS custom properties for theming |
| Why use it | Project spec requires shadcn/ui. Provides accessible, unstyled primitives that pair perfectly with Tailwind. The per-block style system can leverage shadcn's variant pattern via CVA. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@tailwindcss/postcss` ^4.1.18 | PostCSS plugin for Tailwind v4 | Required -- Tailwind v4 uses PostCSS plugin instead of CLI for Next.js integration |
| `@tailwindcss/typography` ^0.5.19 | Prose typography styles | Styles rich text content rendered from Lexical. Use `prose` class on rich text output containers. |
| `postcss` ^8.4.38 | CSS processing | Required by Tailwind v4's PostCSS plugin |
| `eslint` ^9.16.0 | Linting | Use flat config format (eslint.config.mjs). ESLint 9 is current. |
| `eslint-config-next` 15.4.11 | Next.js ESLint rules | Pin to same version as Next.js |
| `prettier` ^3.4.2 | Code formatting | Standard formatting. Configure with Tailwind plugin for class sorting. |
| `tsx` 4.21.0 | TypeScript execution | Runs .ts scripts directly. Used for setup scripts, seed scripts, migrations. |
| `vitest` 4.0.18 | Unit testing | Faster than Jest, native ESM support. Payload is fully ESM so Jest requires extra config. |
| `@testing-library/react` 16.3.0 | Component testing | Standard React testing library. Use with vitest + jsdom. |
| `@playwright/test` 1.58.2 | E2E testing | Browser automation for testing the full block editing flow. |

## Installation

```bash
# Core Payload packages (all same version)
pnpm add payload @payloadcms/next @payloadcms/db-postgres @payloadcms/richtext-lexical @payloadcms/ui @payloadcms/live-preview-react

# Official Payload plugins
pnpm add @payloadcms/plugin-seo @payloadcms/plugin-form-builder @payloadcms/plugin-redirects @payloadcms/plugin-nested-docs @payloadcms/plugin-search

# Next.js + React
pnpm add next@15.4.11 react@19.2.1 react-dom@19.2.1

# Supporting libraries
pnpm add sharp class-variance-authority clsx tailwind-merge lucide-react react-hook-form next-sitemap cross-env dotenv geist tw-animate-css

# Optional
pnpm add graphql prism-react-renderer

# Dev dependencies
pnpm add -D typescript@5.7.3 @types/node @types/react @types/react-dom
pnpm add -D tailwindcss@^4.1.18 @tailwindcss/postcss @tailwindcss/typography postcss autoprefixer
pnpm add -D eslint eslint-config-next@15.4.11 prettier
pnpm add -D tsx vitest jsdom @testing-library/react @playwright/test
pnpm add -D @vitejs/plugin-react vite-tsconfig-paths

# shadcn/ui components (after init)
pnpx shadcn@latest init
pnpx shadcn@latest add button input select checkbox label dialog dropdown-menu sheet tabs accordion card badge separator skeleton tooltip
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@payloadcms/db-postgres` | `@payloadcms/db-vercel-postgres` | Only if deploying to Vercel with Neon/Vercel Postgres. Uses `@vercel/postgres` for serverless connection pooling. Not suitable for VPS/Docker. |
| `@payloadcms/db-postgres` | `@payloadcms/db-mongodb` | If you need flexible schemas without migrations. MongoDB is Payload's original database. Not recommended here because Postgres JSON columns give us schema flexibility where needed while keeping relational integrity elsewhere. |
| `@payloadcms/richtext-lexical` | `@payloadcms/richtext-slate` | Never. Slate adapter is legacy/maintenance-only. Lexical has custom block support, better performance, and active development. |
| Next.js 15.4.x | Next.js 16.x | When Payload fully stabilizes Next.js 16 support (requires canary builds as of March 2026). Payload 3.73+ added support but only for 16.2+ canary. Wait for a stable Next.js 16 release that Payload officially supports. |
| `vitest` | `jest` | Never for this project. Payload is fully ESM. Jest's ESM support requires extensive `--experimental-vm-modules` configuration. Vitest handles ESM natively. |
| Radix UI (via shadcn) | Base UI (via shadcn) | If you need unstyled components closer to MUI ecosystem. Radix is the default and better documented with shadcn. |
| `lucide-react` | `@heroicons/react` | If you prefer Heroicons' design language. Lucide is shadcn's default and has broader icon coverage. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@payloadcms/db-vercel-postgres` | Designed for Vercel serverless. Falls back to `pg` for local databases. Adds unnecessary abstraction for VPS/Docker deployment. | `@payloadcms/db-postgres` |
| `@payloadcms/richtext-slate` | Legacy editor. No custom blocks-in-rich-text support. Will eventually be deprecated. | `@payloadcms/richtext-lexical` |
| `tailwind.config.js` / `tailwind.config.ts` | Tailwind v4 uses CSS-first configuration via `@theme` in your CSS file. Config files are v3 patterns. | `@theme` directive in global CSS |
| `styled-components` / `emotion` | CSS-in-JS adds runtime overhead and conflicts with React Server Components. Payload + Next.js App Router = server-first. | Tailwind CSS utility classes |
| `next-auth` / `lucia` | Project explicitly excludes frontend auth. Admin auth is handled by Payload natively. | Payload's built-in admin auth |
| `prisma` | Payload uses Drizzle ORM internally via the Postgres adapter. Adding Prisma creates two ORMs competing for the same database. | Payload's built-in data layer / Drizzle |
| `mongoose` | Only relevant with MongoDB adapter. We use Postgres. | `@payloadcms/db-postgres` (Drizzle) |
| Vercel-specific features (`@vercel/analytics`, `@vercel/speed-insights`) | Project constraint: no Vercel vendor lock-in. Must work on VPS/Docker. | Self-hosted analytics (Plausible, Umami) if needed |
| `create-payload-app` for scaffolding | Our starter IS the scaffold. Using `create-payload-app` would give us the default template which we're redesigning. | Manual setup from scratch, referencing the official template for patterns |

## Key Configuration Patterns

### Payload Config with Block References

```typescript
// payload.config.ts -- use blockReferences to keep schema clean
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

export default buildConfig({
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    // Store deeply nested blocks as JSON columns
    // Avoids excessive table creation for block variants
  }),
  editor: lexicalEditor(),
  // Define blocks once at the top level
  blocks: [
    HeadingBlock,
    ParagraphBlock,
    ImageBlock,
    // ... all atomic blocks defined once
  ],
  collections: [
    {
      slug: 'pages',
      fields: [
        {
          name: 'layout',
          type: 'blocks',
          // Reference blocks by slug instead of inlining config
          blockReferences: ['heading', 'paragraph', 'image'],
          blocks: [], // Empty -- using references
        },
      ],
    },
  ],
})
```

### Next.js Config with Payload

```typescript
// next.config.ts
import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig = {
  output: 'standalone', // Required for Docker/VPS deployment
  images: {
    remotePatterns: [
      // Configure based on media storage location
    ],
  },
}

export default withPayload(nextConfig)
```

### Tailwind v4 CSS Configuration

```css
/* globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  /* shadcn/ui CSS variables */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... theme tokens */
}
```

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `payload@^3.79` | `next@15.4.x` | Stable, production-ready combination |
| `payload@^3.73` | `next@16.2+ (canary)` | Experimental -- requires canary Next.js builds |
| `next@15.4.11` | `react@19.2.x` | Officially supported pairing |
| `tailwindcss@^4.1` | `@tailwindcss/postcss@^4.1` | Must match major.minor versions |
| `shadcn CLI v4` | `tailwindcss@^4.0` | shadcn CLI v4 generates Tailwind v4 compatible code |
| `eslint-config-next` | `next` | Pin to same version as Next.js |
| All `@payloadcms/*` packages | Each other | Must all be the same version. Mix-and-match causes runtime errors. |

## Version Pinning Strategy

**Critical rule:** All `@payloadcms/*` packages must be the same version. Payload publishes all packages simultaneously. Use a single version variable or caret range.

```json
{
  "dependencies": {
    "payload": "^3.79.0",
    "@payloadcms/next": "^3.79.0",
    "@payloadcms/db-postgres": "^3.79.0",
    "@payloadcms/richtext-lexical": "^3.79.0"
  }
}
```

Use `pnpm update --filter payload --filter '@payloadcms/*'` to update all Payload packages together.

## Sources

- [Payload CMS GitHub Releases](https://github.com/payloadcms/payload/releases) -- latest version 3.79.0 (HIGH confidence)
- [Payload Website Template package.json](https://github.com/payloadcms/payload/blob/main/templates/website/package.json) -- dependency versions verified from raw source (HIGH confidence)
- [Payload Postgres Documentation](https://payloadcms.com/docs/database/postgres) -- db-postgres adapter config, blocksAsJSON (HIGH confidence)
- [Payload Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks) -- blockReferences feature (HIGH confidence)
- [Payload Plugins Documentation](https://payloadcms.com/docs/plugins/overview) -- official plugin list (HIGH confidence)
- [Payload Live Preview Documentation](https://payloadcms.com/docs/live-preview/overview) -- server component support (HIGH confidence)
- [Next.js 16 Compatibility Discussion](https://github.com/payloadcms/payload/discussions/14330) -- Next.js 16 requires canary builds (HIGH confidence)
- [Tailwind CSS v4.2 Release](https://github.com/tailwindlabs/tailwindcss/releases) -- v4.1.18 in template (HIGH confidence)
- [shadcn/ui CLI v4 Changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4) -- CLI v4 with design presets (HIGH confidence)
- [sharp npm](https://www.npmjs.com/package/sharp) -- v0.34.2 for image processing (HIGH confidence)

---
*Stack research for: Payload CMS v3 website starter with composable block architecture*
*Researched: 2026-03-14*
