# Project Research Summary

**Project:** Payload CMS v3 Website Starter with Composable Block Architecture
**Domain:** Headless CMS website starter — block-based page builder
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

This project builds a production-quality Payload CMS v3 website starter with a composable, Shopify-inspired nested block architecture. Experts building in this domain use Payload's native block system with `blockReferences` to keep schemas DRY, `blocksAsJSON` Postgres storage to avoid table explosion, and `interfaceName` on every block to produce clean TypeScript types. The recommended approach layers three tiers of blocks: atomic blocks (Heading, Paragraph, Image, Button, etc.) compose into section blocks (Hero, CTA, Features, etc.), which pages assemble into full layouts. This mirrors the Shopify theme architecture and is the primary differentiator from Payload's own flat-block official template.

The recommended stack is Payload CMS v3 (pinned to ^3.79.0) inside Next.js 15.4.x with React 19, PostgreSQL 16+, Tailwind CSS v4, and shadcn/ui. All `@payloadcms/*` packages must stay on the same version — this is the single most common cause of build failures in the ecosystem. Tailwind v4 uses CSS-first configuration (`@theme` directive, no `tailwind.config.js`), and the entire application should lean on React Server Components with client boundaries only at interactive leaf nodes.

The dominant risks all cluster in Phase 1. Using relational block storage with deep nesting produces table explosions, identifier-length collisions, and discriminator name crashes — all of which vanish with `blocksAsJSON: true` from the start. The `blockReferences` + `interfaceName` pattern must also be established in Phase 1; retrofitting it later is tedious and fragile. Migration strategy (avoid mixing `db:push` and `payload migrate:create`) must be decided before any real content is created. These are well-understood problems with documented solutions — the risk is skipping the setup, not lacking the knowledge.

## Key Findings

### Recommended Stack

Payload CMS v3 is the only headless CMS that installs directly into a Next.js app folder, providing a Local API (no HTTP round-trip) for RSC data fetching and a fully TypeScript-native config system. The Postgres adapter's `blocksAsJSON` feature (available since v3.60.0) is non-negotiable for a deeply nested composable block system — it collapses what would be dozens of relational tables into a single JSONB column per layout field. Tailwind v4 pairs directly with the CSS variable theming system shadcn/ui requires, and the official Payload website template already ships both.

**Core technologies:**
- **Payload CMS ^3.79.0**: Headless CMS + backend — native Next.js integration, block system, typed config
- **Next.js 15.4.11**: Full-stack framework — pinned to what Payload's official template ships; Next.js 16 is experimental with Payload as of March 2026
- **React 19.2.1**: UI library — required by Next.js 15.4; Server Components and streaming are central
- **PostgreSQL 16+ / `@payloadcms/db-postgres`**: Primary database — Drizzle ORM under the hood; `blocksAsJSON` is the critical option
- **Tailwind CSS v4 / shadcn/ui**: Styling — CSS-first config (`@theme`), design tokens via CSS variables, accessible primitives
- **TypeScript 5.7.3**: Non-negotiable — Payload generates types from config; the entire block system depends on this

**Version rules:**
- All `@payloadcms/*` packages must be the exact same version (published as a monorepo)
- `eslint-config-next` must match the Next.js version
- Tailwind and `@tailwindcss/postcss` must match major.minor
- Use `vitest` not Jest — Payload is fully ESM; Jest requires extensive extra config

### Expected Features

The block system is the foundation every other feature depends on. Nearly all P1 features require atomic blocks to exist before they can be implemented. The official Payload template ships 5 flat block types; this starter differentiates by providing 14 composable atomic blocks with per-block style and settings tabs.

**Must have (table stakes) — v1:**
- Atomic block library (14 blocks: Heading, Paragraph, List, Blockquote, Image, Video, Icon, Button, Link, Container, Grid, Spacer, Divider, FormEmbed)
- Per-block style system (padding, margin, colors, border, custom CSS via Payload `tabs` + `group` fields)
- Per-block settings tab (block-type-specific options: heading tag, image aspect ratio, grid columns, etc.)
- Block frontend renderers as React Server Components
- Pages collection with block-based layout builder
- Posts collection with categories
- Media collection with image sizes and focal point
- Header and Footer globals with nav links
- SEO plugin integration (`@payloadcms/plugin-seo`)
- Draft mode and live preview
- On-demand ISR revalidation via `afterChange` hooks
- Redirects plugin (`@payloadcms/plugin-redirects`)
- `blocksAsJSON` Postgres storage (non-negotiable — must be from day one)
- Dark mode support via shadcn CSS variables

**Should have (competitive differentiators) — v1.x:**
- Pre-composed section presets (Hero, CTA, Features, Testimonials, FAQ, Collection Grid) built from nested atomic blocks
- Live Preview in admin panel (once block renderers are complete)
- Templates collection for dynamic collection pages (single-post, single-product)
- Type-safe dynamic data binding (binds block properties to compatible collection fields)
- Cross-platform setup script (Node.js, not bash — must work on Windows)
- Optional demo content (`--demo` flag)
- Layout Customizer plugin integration point

**Defer (v2+):**
- Theme Settings plugin integration
- Form Builder plugin integration (`@payloadcms/plugin-form-builder`)
- Search plugin integration (`@payloadcms/plugin-search`)
- Nested Docs for hierarchical page trees (`@payloadcms/plugin-nested-docs`)
- Scheduled publishing

**Anti-features to avoid:** Full CSS property abstraction (Webflow-level), frontend authentication, real-time collaborative editing, built-in drag-drop visual editor (deferred to Layout Customizer plugin), Vercel-specific deployment features.

### Architecture Approach

The architecture follows a three-tier block hierarchy: atomic blocks are the smallest indivisible content units, section blocks compose atomics into meaningful layouts, and pages/templates compose sections into full pages. A central block registry (`blocks/registry.ts`) defines all block configs once; collections reference them by slug via `blockReferences` with an empty `blocks: []` array. The `RenderBlocks` component maps `blockType` slugs to React components at render time. The Templates collection adds a fourth concern — reusable layouts with `{{fieldPath}}` binding markers that are resolved at render time against actual collection documents.

**Major components:**
1. **Atomic Block Configs** (`blocks/atomic/*/config.ts`) — Payload Block objects with `interfaceName`, shared `styleOptions` spread in
2. **Section Block Configs** (`blocks/sections/*/config.ts`) — compose atomics via `blockReferences` array in nested `blocks` field
3. **Block Registry** (`blocks/registry.ts`) — single source of truth; exports `allBlocks`, `atomicBlockSlugs`, `sectionBlockSlugs`
4. **RenderBlocks** (`blocks/RenderBlocks.tsx`) — server component that maps `blockType` to React component (thin mapping layer only)
5. **Block Components** (`blocks/*/Component.tsx`) — React Server Components by default; `'use client'` only at interactive leaves
6. **Shared Fields** (`fields/styleOptions.ts`, `fields/settingsTab.ts`, `fields/link.ts`) — DRY field groups spread into block configs
7. **Collections** (`collections/Pages.ts`, `Posts.ts`, `Media.ts`, `Categories.ts`, `Templates.ts`) — use `blockReferences` to the registry
8. **Globals** (`globals/Header.ts`, `Footer.ts`) — site-wide nav, no block system dependency
9. **Data Binding Resolver** (`utilities/resolveBindings.ts`) — walks template block tree, replaces `{{field.path}}` with document values
10. **Plugin Integrations** (`plugins/seo.ts`, `redirects.ts`, etc.) — incremental, added after core is stable

### Critical Pitfalls

1. **Relational block storage with deep nesting** — Use `blocksAsJSON: true` in the Postgres adapter from day one (Phase 1). Without it: table explosion, 63-byte identifier collisions, discriminator name crashes, and multi-join query slowdowns. Switching modes mid-project requires a custom data migration script.

2. **Not using `blockReferences` + `interfaceName` from the start** — Inline block configs in every collection bloat the Payload config object, slow the admin panel, and generate duplicate TypeScript interfaces (`Pages_Layout_HeadingBlock | Templates_Layout_HeadingBlock`). Set `interfaceName` on every block and register globally; use `blockReferences` everywhere.

3. **Mixing `db:push` and `payload migrate:create`** — `db:push` modifies the database without updating Drizzle's JSON snapshot. When you later run `migrate:create`, it generates destructive SQL (DROP TABLE/COLUMN) for schema drift. For a starter template that others will fork, establish migration workflow from day one.

4. **Plugin version mismatches after Payload upgrades** — Payload plugins import from internal `payload/shared` paths that change between minor versions. Always upgrade all `@payloadcms/*` packages simultaneously and add plugins incrementally (SEO first, verify build, then add Form Builder, etc.).

5. **Client component boundary mistakes in block rendering** — The block renderer and all static blocks (Heading, Paragraph, Image, Spacer) must be Server Components. Only interactive leaf nodes (Accordion, Form embed) use `'use client'`. Marking the renderer client defeats RSC streaming and inflates the JS bundle.

## Implications for Roadmap

Based on dependency mapping from FEATURES.md and build order from ARCHITECTURE.md, a 4-phase structure is recommended.

### Phase 1: Foundation

**Rationale:** The block system is the dependency root for everything else. Before writing a single block, the database storage strategy, type generation pattern, and migration workflow must be locked in — because changing them later is destructive. This phase has the highest concentration of critical pitfalls.

**Delivers:** Working Payload + Next.js monolith, PostgreSQL with `blocksAsJSON` configured, block registry scaffold with `blockReferences` + `interfaceName` patterns established, migration workflow documented, project structure in place.

**Addresses (from FEATURES.md):** TypeScript throughout, Postgres JSON block storage, global block references — the invisible infrastructure features.

**Avoids:** Pitfall 1 (relational storage), Pitfall 2 (config bloat), Pitfall 3 (type explosion), Pitfall 4 (identifier collisions), Pitfall 5 (discriminator collisions), Pitfall 9 (migration snapshot corruption).

**Stack elements:** Payload ^3.79.0, `@payloadcms/db-postgres` with `blocksAsJSON: true`, Next.js 15.4.11, TypeScript 5.7.3, `withPayload()` next.config.ts, Tailwind v4 CSS-first setup, shadcn/ui init.

### Phase 2: Block System + Core Collections

**Rationale:** Once the foundation patterns are proven, build all 14 atomic blocks and then the section blocks that compose them. Core collections (Pages, Posts, Media, Categories) and globals (Header, Footer) follow because they depend on the block registry. SEO, drafts, revalidation, and redirects are added here because they are table stakes and all depend on collections existing.

**Delivers:** Full atomic block library with per-block style and settings tabs, section block presets, Pages/Posts/Media/Categories collections, Header/Footer globals, frontend block renderers as RSCs, draft mode, live preview, on-demand revalidation, SEO plugin, redirects plugin.

**Addresses:** All P1 features from FEATURES.md. The complete MVP — a working composable page builder.

**Avoids:** Pitfall 7 (live preview depth — set depth >= 3 from the start), Pitfall 8 (plugin versions — add SEO first, verify, then redirects), Pitfall 10 (admin form overload — style fields in collapsible Styles tab), Pitfall 11 (RSC boundaries — static blocks stay server, interactive leaves use client).

**Implements:** Atomic Block Configs, Section Block Configs, Block Registry, RenderBlocks, Block Components, Shared Fields (styleOptions, settingsTab, link).

### Phase 3: Templates + Data Binding

**Rationale:** The Templates collection requires a stable block system API before the binding interface can be designed. Dynamic data binding is the most architecturally complex feature and must be built after blocks are proven in production-like conditions. Plugin integrations beyond SEO/redirects (Form Builder, Search) are deferred to v2+ but the architecture integration points should be documented here.

**Delivers:** Templates collection, `resolveBindings` utility, type-safe field compatibility map, admin UI for selecting binding targets (custom React components, not async field options), Layout Customizer plugin integration point documentation.

**Addresses:** Templates collection for dynamic pages, type-safe dynamic data binding, Layout Customizer integration point — all P2 features.

**Avoids:** Pitfall 6 (async field options — use custom admin React components that fetch field lists client-side, not `options` functions).

### Phase 4: Developer Experience + Deployment

**Rationale:** Once the product is feature-complete, the setup experience and deployment configuration are finalized. The setup script depends on knowing the final project structure; the Docker configuration depends on knowing the build output.

**Delivers:** Cross-platform setup script (Node.js, no bash — works on Windows), optional `--demo` seed data, Docker configuration (`output: 'standalone'`), environment variable documentation, migration runbook for production deployments.

**Addresses:** Cross-platform setup script, optional demo content — P2 features.

**Avoids:** Pitfall 12 (cross-platform script issues — use `pg` npm package for DB creation, not `psql` CLI; use `cross-env` for env vars).

### Phase Ordering Rationale

- Foundation before blocks: `blocksAsJSON`, `blockReferences`, and `interfaceName` must be decided before the first block config is written. These decisions cannot be safely changed after content exists.
- Blocks before collections: Collections reference blocks via `blockReferences`. Block registry must be complete before collection configs are written.
- Collections before templates: The Templates collection's data binding system needs to know what fields exist on target collections (Posts, etc.).
- Everything before DX phase: Setup script needs to reflect the final project structure to be correct.
- Live preview after block renderers: You cannot preview blocks that have no frontend renderer. Renderers must be complete before live preview is meaningful.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 3 (Templates + Data Binding):** The type-safe field binding implementation is the least-documented aspect of this architecture. Custom admin React components for field selection require understanding Payload's form state context API. Needs research-phase before implementation.
- **Phase 3 (Layout Customizer integration):** The payload-customiser plugin's API surface (how it reads/writes to the blocks field, what hooks it exposes) needs review before designing the integration point.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Foundation):** All patterns are explicitly documented in Payload official docs. `blocksAsJSON`, `blockReferences`, `interfaceName` all have official documentation and examples.
- **Phase 2 (Block System):** RSC patterns, Tailwind v4 integration, shadcn component usage are well-documented. Live preview depth parameter behavior is confirmed in docs.
- **Phase 4 (DX + Deployment):** Cross-platform Node.js patterns and Docker/Next.js standalone output are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified from official Payload GitHub template's `package.json`. Compatibility matrix confirmed from release notes and GitHub discussions. |
| Features | HIGH | Table stakes verified against Payload's own template and headless CMS checklists. Differentiators cross-referenced against Shopify, Webflow, and Elementor feature documentation. |
| Architecture | HIGH | Build order and component boundaries verified against official Payload docs (blocks, blockReferences, interfaceName, Local API). Patterns match the official website template's structure. |
| Pitfalls | HIGH | All critical pitfalls confirmed via GitHub issues with linked evidence. `blocksAsJSON` behavior confirmed in release notes and official docs. Plugin compatibility issues confirmed via specific GitHub issue numbers. |

**Overall confidence:** HIGH

### Gaps to Address

- **`blocksAsJSON` query limitations:** Confirmed you cannot query inside JSONB block content via Payload's query API. For this starter (querying by page slug, not block content), this is acceptable. Validate during Phase 1 that there are no edge cases (e.g., collection archive blocks that filter by embedded tags).
- **Layout Customizer plugin API:** The payload-customiser plugin's exact integration surface is not fully documented. Treat Phase 3 integration points as provisional — the actual integration architecture should be validated against the plugin's current codebase.
- **`resolveBindings` depth:** The data binding resolution utility shown in ARCHITECTURE.md handles top-level string fields only. Nested block fields (e.g., a section containing a heading that binds to a post field) require recursive traversal. Flag for research-phase in Phase 3.
- **Payload plugin stability at v3.79:** Form Builder and Search plugins have had compatibility issues at minor version bumps. These are deferred to v2+, but if pulled in earlier, verify build with the specific Payload version before committing.

## Sources

### Primary (HIGH confidence)
- [Payload CMS GitHub Releases](https://github.com/payloadcms/payload/releases) — version 3.79.0, release notes for blocksAsJSON (v3.60.0), nested block fixes (v3.43.0)
- [Payload Website Template package.json](https://github.com/payloadcms/payload/blob/main/templates/website/package.json) — dependency versions
- [Payload Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks) — blockReferences, interfaceName, dbName
- [Payload Postgres Adapter Documentation](https://payloadcms.com/docs/database/postgres) — blocksAsJSON, table naming, identifier limits
- [Payload Live Preview Documentation](https://payloadcms.com/docs/live-preview/server) — depth parameter, server component support
- [Payload Migrations Documentation](https://payloadcms.com/docs/database/migrations) — push vs migrate workflow
- [Payload Blog: interfaceName](https://payloadcms.com/posts/blog/interfacename-generating-composable-graphql-and-typescript-types) — composable TypeScript types
- [Shopify Theme Blocks Architecture](https://shopify.dev/docs/storefronts/themes/architecture/blocks) — nesting model reference

### Secondary (MEDIUM confidence)
- [GitHub Discussion #12099](https://github.com/payloadcms/payload/discussions/12099) — blocksAsJSON community validation
- [GitHub Discussion #9403](https://github.com/payloadcms/payload/discussions/9403) — relational block performance reports
- [GitHub Issue #6957](https://github.com/payloadcms/payload/issues/6957), [#12719](https://github.com/payloadcms/payload/issues/12719) — nested block discriminator collisions
- [GitHub Issue #4941](https://github.com/payloadcms/payload/issues/4941) — Postgres 63-byte identifier limit
- [GitHub Issue #9977](https://github.com/payloadcms/payload/issues/9977), [#8885](https://github.com/payloadcms/payload/issues/8885) — plugin compatibility breakage
- [Build with Matija: Push to migrations](https://www.buildwithmatija.com/blog/payloadcms-postgres-push-to-migrations) — migration workflow
- [Build with Matija: Dynamic cross-collection dropdowns](https://www.buildwithmatija.com/blog/dynamic-cross-collection-dropdowns-payload-cms-v3) — async field options limitation
- [PayloadBlocks.dev](https://www.payloadblocks.dev/) — existing community block ecosystem

### Tertiary (LOW confidence — needs validation)
- Layout Customizer plugin API surface — inferred from payload-customiser project description; needs direct code review
- `resolveBindings` recursive depth behavior — conceptual design only; not validated against implementation

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
