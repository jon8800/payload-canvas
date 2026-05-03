# Domain Pitfalls

**Domain:** Payload CMS v3 batteries-included website starter with composable block system
**Researched:** 2026-03-14

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Relational Block Storage Creates Table Explosion and Performance Death

**What goes wrong:** Without `blocksAsJSON`, every block type creates its own Postgres table. A system with 15+ atomic block types used across Pages, Templates, and Globals generates dozens of tables with deep JOIN chains. Queries for a single page with 20 blocks can involve 15+ table joins. Users have reported 3x+ performance regressions with deeply nested blocks in relational mode.

**Why it happens:** Payload's default Postgres adapter maps each block type to its own relational table. This is fine for 3-5 simple blocks, but a composable system with nested blocks (sections containing atomic blocks) multiplies the table count exponentially.

**Consequences:** Slow page loads (reported 10s+ for complex pages), memory leaks during development, migration files that are hundreds of lines long, and painful schema changes when adding new block types.

**Prevention:**
- Use `blocksAsJSON: true` in the Postgres adapter config from day one. This stores blocks as a JSON column instead of relational tables. Available since Payload v3.60.0.
- Accept the tradeoff: you cannot query *inside* block content via Payload's query API when using JSON storage. For a page builder, this is acceptable since you query pages by slug/ID, not by block content.
- NEVER switch from relational to JSON storage mid-project without a data migration strategy. Switching modes deletes existing block data from relational tables without migrating it to JSON.

**Detection:**
- Migration files growing excessively large with each new block type
- `db:push` taking unusually long
- Page API responses slowing as content complexity grows

**Phase relevance:** Must be decided in Phase 1 (Foundation). Switching later requires a custom data migration script.

**Confidence:** HIGH -- confirmed via official Payload docs and GitHub discussion [#12099](https://github.com/payloadcms/payload/discussions/12099), release notes for v3.60.0, and community performance reports in [#9403](https://github.com/payloadcms/payload/discussions/9403).

---

### Pitfall 2: Not Using blockReferences Causes Config Bloat and Admin Panel Slowdown

**What goes wrong:** Defining block configs inline in every collection field duplicates the entire block definition across Pages, Templates, and any other collection using blocks. The Payload Config object balloons in size, sending excessive data to the admin panel client and requiring redundant server-side processing for permissions.

**Why it happens:** The intuitive approach is to import block config objects and spread them into each collection's `blocks` array. This works functionally but Payload treats each inline occurrence as a separate block definition, processing it independently.

**Consequences:** Admin panel loads slowly. TypeScript type generation creates duplicate interfaces. Config becomes hard to maintain -- changing a block's fields requires updating every location it appears.

**Prevention:**
- Define all blocks in the root `blocks` array of the Payload Config (`buildConfig({ blocks: [...] })`).
- Use `blockReferences: ['BlockSlug']` in collection fields instead of inline `blocks: [BlockConfig]`.
- Keep the `blocks` array empty (`blocks: []`) in the field config for compatibility.
- Accept the limitation: blocks referenced via `blockReferences` are isolated from collection context. Access control hooks on referenced blocks do not have access to collection-level data. Block configs cannot be extended per-collection.

**Detection:**
- Admin panel initial load time increasing as you add blocks
- Generated TypeScript file (`payload-types.ts`) containing near-duplicate block types with collection-prefixed names
- Config object size growing beyond ~200KB

**Phase relevance:** Phase 1 (Foundation). The block architecture pattern must use `blockReferences` from the start. Retrofitting is tedious but not destructive.

**Confidence:** HIGH -- confirmed via [official Payload blocks documentation](https://payloadcms.com/docs/fields/blocks) and [Payload Config docs](https://payloadcms.com/docs/configuration/overview).

---

### Pitfall 3: TypeScript Schema Explosion Without interfaceName

**What goes wrong:** Without `interfaceName` on block definitions, Payload generates deeply nested TypeScript types tied to the collection they appear in. A `Heading` block in Pages generates `Pages_Layout_HeadingBlock`, while the same block in Templates generates `Templates_Layout_HeadingBlock`. Frontend components end up with complex union type gymnastics to render blocks that are logically identical.

**Why it happens:** Payload's type generator scopes block interfaces to their parent collection by default. This is correct behavior for blocks that only exist in one place, but wrong for a shared block system.

**Consequences:** Frontend block renderer components need to accept unions of multiple generated types for the same logical block. Type narrowing becomes verbose. Refactoring block fields requires updating types in multiple places.

**Prevention:**
- Set `interfaceName` on every block definition: `{ slug: 'heading', interfaceName: 'HeadingBlock', ... }`.
- Use a naming convention that avoids collision with collection names (e.g., suffix with `Block`: `HeadingBlock`, `ImageBlock`, `ContainerBlock`).
- When using `blockReferences` (Pitfall 2), `interfaceName` is auto-generated from the slug if not set, but setting it explicitly ensures predictable naming.
- Run `pnpm payload generate:types` after any block config change and review the output.

**Detection:**
- `payload-types.ts` containing multiple interfaces for the same logical block type
- Frontend components requiring complex type unions like `Pages_Layout_HeadingBlock | Templates_Layout_HeadingBlock`

**Phase relevance:** Phase 1 (Foundation). Must be established in the block definition pattern.

**Confidence:** HIGH -- confirmed via [Payload blog post on interfaceName](https://payloadcms.com/posts/blog/interfacename-generating-composable-graphql-and-typescript-types) and [official blocks docs](https://payloadcms.com/docs/fields/blocks).

---

### Pitfall 4: Postgres Identifier Length Limit (63 bytes) Truncation Collisions

**What goes wrong:** Deeply nested block structures generate long Postgres table and constraint names. When two names exceed 63 characters (Postgres's identifier limit), they get truncated to the same string, causing "relation already exists" errors during migrations.

**Why it happens:** Payload auto-generates table names from the path: `pages_layout_sections_content_blocks_heading`. With nested blocks (sections containing atomic blocks), names easily exceed 63 characters. Constraint names (indexes, foreign keys) are even longer.

**Consequences:** `db:push` and `payload migrate:create` fail with cryptic Postgres errors. This typically surfaces mid-development when you add a new nested block level or a block with a longer slug name.

**Prevention:**
- Use short, concise slugs for blocks and fields: `heading` not `headingTextBlock`, `cta` not `callToActionSection`.
- Set explicit `dbName` on blocks and fields that participate in deep nesting to control table name length.
- Using `blocksAsJSON: true` (Pitfall 1) eliminates this entirely since blocks are stored as a single JSON column, not separate tables.
- Test migrations early with the full block set to catch collisions before content is created.

**Detection:**
- Migration errors mentioning "relation already exists"
- `db:push` failing after adding a new block type or nesting level

**Phase relevance:** Phase 1 (Foundation) if using relational storage. Non-issue if using `blocksAsJSON`.

**Confidence:** HIGH -- confirmed via [GitHub issue #4941](https://github.com/payloadcms/payload/issues/4941) and [Postgres docs on identifiers](https://payloadcms.com/docs/database/postgres).

---

### Pitfall 5: Nested Blocks Discriminator Name Collisions

**What goes wrong:** When using blocks inside other blocks (e.g., a Section block containing Heading, Image, Button blocks), Payload can throw "Discriminator with name already exists" errors, particularly when the same block type appears at multiple nesting levels.

**Why it happens:** Payload's Drizzle-based Postgres adapter uses discriminator columns to distinguish block types within a polymorphic table structure. When the same block slug appears at different depths, the discriminator names can collide. This has been a recurring issue across multiple Payload versions, with fixes in v3.39.0 and v3.43.0 addressing specific regressions.

**Consequences:** Builds fail entirely. Migrations cannot be generated. This blocks development completely.

**Prevention:**
- Use `blocksAsJSON: true` to sidestep the entire relational nesting problem.
- If using relational storage: ensure unique slugs at every nesting level. Do not allow the same block type to appear at different nesting depths within the same field hierarchy.
- Pin Payload to a known-working version and test upgrades in a branch before adopting.
- Set `dbName` explicitly on nested block fields to avoid auto-generated name collisions.

**Detection:**
- Build errors containing "Discriminator with name already exists"
- Migration generation failures

**Phase relevance:** Phase 1 (Foundation). Architecture decision on `blocksAsJSON` eliminates this.

**Confidence:** HIGH -- confirmed via [GitHub issue #6957](https://github.com/payloadcms/payload/issues/6957), [issue #12719](https://github.com/payloadcms/payload/issues/12719), and [release notes for v3.43.0](https://github.com/payloadcms/payload/releases/tag/v3.43.0).

## Moderate Pitfalls

### Pitfall 6: Dynamic Data Binding Cannot Use Async Field Options

**What goes wrong:** The project requires type-safe dynamic data binding where block properties reference compatible collection fields (e.g., a text block in a Template can bind to a text field on the target collection). Implementing this as dynamic select/dropdown options that fetch collection schemas at config time fails because Payload's field initialization runs synchronously during startup.

**Why it happens:** Payload v3 with the Drizzle adapter cannot handle async functions in field `options` properties. Field configuration expects an immediate array, not a Promise. The database connection is not available during field initialization.

**Consequences:** The "elegant" approach of having the admin panel dynamically show compatible fields based on block type and target collection cannot work through standard Payload field config.

**Prevention:**
- Implement dynamic field selection using custom React admin components that fetch available fields client-side via the Payload API.
- Alternatively, use a `beforeChange` hook to validate bindings at save time rather than constraining them at field-render time.
- Define field compatibility maps as static TypeScript objects that map block types to compatible Payload field types (`text`, `upload`, `richText`), then use these in custom components.

**Detection:**
- Runtime errors when trying to use async functions in field options
- Payload startup crashes with promises in field configs

**Phase relevance:** Phase 3 (Templates). This is specific to the dynamic data binding feature.

**Confidence:** MEDIUM -- confirmed via [community reports on cross-collection dropdowns](https://www.buildwithmatija.com/blog/dynamic-cross-collection-dropdowns-payload-cms-v3) and [GitHub discussion #236](https://github.com/payloadcms/payload/discussions/236). The workaround via custom components is well-established.

---

### Pitfall 7: Live Preview Depth Mismatch with Block-Heavy Pages

**What goes wrong:** Live preview shows incomplete or broken block rendering because the `depth` parameter in the initial page request does not match the depth used in the live preview hook. With nested blocks containing relationships (e.g., Image blocks referencing Media collection), missing depth causes relationship fields to return IDs instead of populated objects.

**Why it happens:** Payload's live preview system requires matching `depth` parameters between the initial server-side fetch and the `useLivePreview` or `RefreshRouteOnSave` configuration. Nested blocks with media, links, or other relationships need higher depth values.

**Consequences:** Preview appears broken -- images show as missing, links display as IDs, nested blocks render incorrectly. Content editors lose trust in the preview system.

**Prevention:**
- Set `depth` to at least 3 (or higher) for block-heavy pages in both the page query and live preview config.
- Use the `select` API to limit which fields are populated at depth, avoiding the performance cost of deep population.
- Test live preview with the most complex page layout early in development, not just simple pages.
- Use server-side live preview (`RefreshRouteOnSave`) for Next.js App Router rather than client-side, as it handles Server Components naturally.

**Detection:**
- Preview showing raw IDs instead of content
- Images or media not appearing in preview
- Discrepancy between published page and preview

**Phase relevance:** Phase 2 (Block System) when implementing preview.

**Confidence:** MEDIUM -- confirmed via [official live preview docs (server)](https://payloadcms.com/docs/live-preview/server) and [community help reports](https://payloadcms.com/community-help/discord/live-preview-with-nextjs).

---

### Pitfall 8: Plugin Version Compatibility with Payload Minor Releases

**What goes wrong:** Official Payload plugins (SEO, Form Builder, Redirects, Nested Docs) break after Payload minor version upgrades. Users report build errors like "fieldIsID is not exported from payload/shared" with the SEO plugin, and "Module not found" errors with the Form Builder plugin.

**Why it happens:** Payload v3 is still actively evolving its internal APIs. Plugins import from `payload/shared` or other internal paths that change between minor versions. The plugin ecosystem does not always release in lockstep with core.

**Consequences:** Build failures after upgrading Payload. Blocked deployments. Time spent debugging import errors.

**Prevention:**
- Pin exact Payload and plugin versions together. When upgrading Payload, upgrade all `@payloadcms/*` packages simultaneously.
- Use `pnpm update --filter @payloadcms/*` to update all Payload packages at once.
- Test builds in CI before merging Payload version upgrades.
- Add plugins incrementally -- do not add all 4 plugins at once. Add SEO first, verify build, then Form Builder, etc.

**Detection:**
- Build errors mentioning missing exports from `payload/*` paths
- TypeScript errors in `node_modules/@payloadcms/plugin-*`

**Phase relevance:** Phase 2-3 when adding plugins. Ongoing concern for maintenance.

**Confidence:** HIGH -- confirmed via [GitHub issue #9977 (SEO)](https://github.com/payloadcms/payload/issues/9977), [issue #8885 (Form Builder)](https://github.com/payloadcms/payload/issues/8885), and [issue #8016 (SEO meta image)](https://github.com/payloadcms/payload/issues/8016).

---

### Pitfall 9: Migration Snapshot Corruption When Mixing db:push and migrate

**What goes wrong:** Using `db:push` during development (which directly modifies the database without creating migration files) and then switching to `payload migrate:create` for production results in migration files that try to drop tables or columns that were already modified by `db:push`. Migrations fail or produce destructive SQL.

**Why it happens:** Payload uses JSON snapshots to diff schema differences and generate SQL migrations. `db:push` modifies the database without updating these snapshots, creating a mismatch between the snapshot state and actual database state.

**Consequences:** Production deployments fail. Data loss if destructive migrations run against production. Need to manually fix migration SQL.

**Prevention:**
- Use `db:push` ONLY in early development before any content exists.
- Switch to migration-based workflow (`payload migrate:create`) before creating any real content or deploying.
- Never mix `db:push` and migrations in the same database.
- For the starter project: document this transition point clearly in the setup guide.
- Consider starting with migrations from day one since this is a starter template that others will use.

**Detection:**
- `migrate:create` generating DROP TABLE or DROP COLUMN statements for tables that should exist
- Migration files containing SQL that contradicts the current schema

**Phase relevance:** Phase 1 (Foundation) for workflow establishment. Phase 4 (Deployment) for production migration strategy.

**Confidence:** HIGH -- confirmed via [official migrations docs](https://payloadcms.com/docs/database/migrations), [community help on production migrations](https://payloadcms.com/community-help/discord/usual-process-to-change-payload-config-database-schema-in-production), and [Build with Matija guide](https://www.buildwithmatija.com/blog/payloadcms-postgres-push-to-migrations).

## Minor Pitfalls

### Pitfall 10: Per-Block Style Options Creating Massive Admin Panel Forms

**What goes wrong:** Adding padding, margin, border-radius, border-width, text-size, background-color, text-color, and custom CSS to every block type creates overwhelming admin forms. Each block's edit panel becomes a wall of fields that content editors struggle with.

**Why it happens:** The natural approach is to add style fields directly to each block config. With 15+ style properties per block and 10+ block types, the admin panel becomes unusable.

**Prevention:**
- Use a shared style group config (Payload `group` field type) that is included in blocks via spread, not duplicated.
- Put style options in a collapsible "Styles" tab using the `tabs` field type, keeping them hidden by default.
- Consider progressive disclosure: show only the most common style options (padding, background) by default, with an "Advanced" toggle for the rest.
- The existing Layout Customizer plugin should handle most styling -- keep the admin panel style controls minimal.

**Detection:**
- Content editors complaining about form length
- Block edit panels requiring excessive scrolling

**Phase relevance:** Phase 2 (Block System) when defining block schemas.

**Confidence:** MEDIUM -- based on common page builder UX patterns and project requirements.

---

### Pitfall 11: React Server Component Boundary Mistakes with Block Rendering

**What goes wrong:** Block renderer components are made client components unnecessarily, or the boundary between server and client is drawn at the wrong level, causing excessive client-side JavaScript or hydration issues.

**Why it happens:** Block renderers often need interactivity (e.g., accordions, carousels, form embeds), tempting developers to make the entire block renderer a client component. This defeats RSC benefits.

**Prevention:**
- Make the block renderer (the switch/map component) a Server Component.
- Only individual interactive blocks (accordion, form embed) should be client components at the leaf level.
- Static blocks (Heading, Paragraph, Image, Spacer, Divider) must remain Server Components.
- Use the pattern: `<BlockRenderer blocks={blocks} />` (server) renders `<HeadingBlock />` (server) or `<AccordionBlock />` (client).

**Detection:**
- Large client-side bundle including block rendering logic
- `"use client"` directive on the main block renderer or layout component

**Phase relevance:** Phase 2 (Block System) when building frontend rendering.

**Confidence:** HIGH -- standard Next.js App Router best practice aligned with project constraints.

---

### Pitfall 12: Cross-Platform Setup Script File Path and Shell Issues

**What goes wrong:** Setup scripts that create databases, generate `.env` files, and run migrations fail on Windows due to path separators, shell command differences, or PostgreSQL CLI availability.

**Why it happens:** Node.js scripts using `child_process.exec` with bash-specific commands (e.g., `psql`, `createdb`) fail on Windows where these may not be in PATH. Path separators differ (`\` vs `/`). Line endings cause issues.

**Prevention:**
- Use Node.js built-in `fs` and `path` modules instead of shell commands for file operations.
- For Postgres setup: use `pg` npm package to create databases programmatically rather than shelling out to `psql`/`createdb`.
- Test the setup script on Windows, macOS, and Linux (or at least Windows + one Unix).
- Use `cross-env` or similar for environment variable handling.

**Detection:**
- Setup script working on macOS/Linux but failing on Windows
- Errors mentioning "command not found" for `psql` or `createdb`

**Phase relevance:** Phase 4 (Setup Script / Deployment).

**Confidence:** MEDIUM -- based on common cross-platform Node.js development patterns and project constraint requiring Windows support.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Foundation / DB Config | Relational block storage (Pitfall 1), identifier collisions (Pitfall 4) | Enable `blocksAsJSON: true` from day one |
| Phase 1: Foundation / Block Architecture | Config bloat (Pitfall 2), type explosion (Pitfall 3) | Use `blockReferences` + `interfaceName` pattern |
| Phase 1: Foundation / Migration Strategy | Snapshot corruption (Pitfall 9) | Start with migration workflow, avoid `db:push` |
| Phase 2: Block System / Schemas | Admin form overload (Pitfall 10), discriminator collisions (Pitfall 5) | Style tabs, JSON storage |
| Phase 2: Block System / Frontend | RSC boundary mistakes (Pitfall 11), preview depth (Pitfall 7) | Server-first rendering, depth >= 3 |
| Phase 3: Templates / Data Binding | Async field options (Pitfall 6) | Custom admin React components for field selection |
| Phase 3: Plugins | Version compatibility (Pitfall 8) | Pin versions, incremental plugin adoption |
| Phase 4: Setup / Deployment | Cross-platform scripts (Pitfall 12), migration workflow | Programmatic DB setup, test on Windows |

## Sources

- [Payload CMS Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks) -- blockReferences, interfaceName, dbName
- [Payload CMS Postgres Documentation](https://payloadcms.com/docs/database/postgres) -- blocksAsJSON, table naming
- [Payload CMS Performance Documentation](https://payloadcms.com/docs/performance/overview) -- block references optimization
- [Payload CMS Migrations Documentation](https://payloadcms.com/docs/database/migrations) -- migration workflow
- [Payload CMS Live Preview (Server)](https://payloadcms.com/docs/live-preview/server) -- depth parameter
- [GitHub Discussion #12099: blocksAsJSON](https://github.com/payloadcms/payload/discussions/12099) -- JSON storage feature request and implementation
- [GitHub Discussion #9403: Performance degradation](https://github.com/payloadcms/payload/discussions/9403) -- relational block performance
- [GitHub Issue #6957: Blocks in blocks Postgres](https://github.com/payloadcms/payload/issues/6957) -- nested block migration failures
- [GitHub Issue #12719: v3.39.0 nested blocks regression](https://github.com/payloadcms/payload/issues/12719) -- build failures with nested blocks
- [GitHub Issue #4941: Identifier collision](https://github.com/payloadcms/payload/issues/4941) -- Postgres 63-byte limit
- [GitHub Issue #9977: SEO plugin build error](https://github.com/payloadcms/payload/issues/9977) -- plugin compatibility
- [GitHub Issue #8885: Form Builder module not found](https://github.com/payloadcms/payload/issues/8885) -- plugin compatibility
- [Payload Blog: interfaceName composable types](https://payloadcms.com/posts/blog/interfacename-generating-composable-graphql-and-typescript-types) -- TypeScript type management
- [Build with Matija: Push to migrations guide](https://www.buildwithmatija.com/blog/payloadcms-postgres-push-to-migrations) -- migration workflow
- [Build with Matija: Dynamic cross-collection dropdowns](https://www.buildwithmatija.com/blog/dynamic-cross-collection-dropdowns-payload-cms-v3) -- async field limitations
- [GitHub Release v3.43.0](https://github.com/payloadcms/payload/releases/tag/v3.43.0) -- nested blocks regression fix
