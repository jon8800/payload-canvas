# Phase 3: Collections & Content - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

All content collections (Pages, Posts, Media, Categories, Tags) and a Template Parts collection (replacing Header/Footer globals). Versions, auto-save, trash, query presets across main collections. Frontend routing for pages and posts. Template parts system with display conditions for header/footer/custom parts — built using the same nested block system as page layouts.

**Scope change from roadmap:** COLL-04 (Navigation globals) is now implemented as a Template Parts collection instead of Header/Footer globals. This pulls forward part of the template system concept (TMPL-01 from v2) but scoped to site chrome (headers, footers, custom parts) — not full page templates with dynamic data binding (that remains v2).

</domain>

<decisions>
## Implementation Decisions

### Page Routing
- Catch-all route `[...slug]` for maximum URL flexibility (any depth)
- Pages have title + slug fields only (slug uses Payload's built-in slug field)
- No parent page field, no meta description, no featured image as standalone fields (SEO plugin handles meta in Phase 5)
- Homepage: Dedicated global/setting that references a page — renders at `/`

### Post Structure
- URL pattern: `/blog/[slug]`
- Categories collection (hierarchical via Nested Docs plugin) + Tags collection (flat)
- Post fields: title, slug, featured image, excerpt, author (relationship to Users), published date, layout blocks
- Post scheduling: `publishOn` date field for future publishing with draft/publish workflow
- Versions with max 50 on Posts (same as Pages)
- Auto-save at 300-350ms for live preview support
- Trash (soft delete) on Posts

### Template Parts (replaces Header/Footer globals)
- Template Parts collection built using the same nested block system as pages
- Part types: Header, Footer, Custom (freeform type field)
- Parts are built from the same atomic blocks — Container, Grid, Button, Link, Image, etc.
- Display conditions on each template part (self-declaring where they appear):
  - Entire site (default for all pages/posts)
  - Specific pages (select individual pages)
  - Collection type (all blog posts, all pages, etc.)
  - Exclude pages (show everywhere except specific pages)
- Priority: Most specific condition wins automatically (specific page > collection type > entire site)
- No Header/Footer globals — template parts replace them entirely
- Mega menu: to be solved with blocks (possibly a dedicated nav menu block or nested link blocks)

### Frontend Layout
- Root layout.tsx resolves matching template parts (header/footer) based on current route
- Template parts render their block layouts using the same RenderBlocks component
- Pages render their own block layouts in the content area between header and footer

### Collections Config (from requirements)
- Pages: versions (max 50), auto-save (300-350ms), trash (soft delete), query presets
- Posts: versions (max 50), auto-save (300-350ms), trash (soft delete), query presets
- Media: folders, focal point, image sizes — NO trash (direct delete), NO versions
- Categories: hierarchical via Nested Docs plugin
- Tags: flat collection
- Template Parts: versions, auto-save, trash, query presets

### Claude's Discretion
- Exact display condition resolution logic (how to efficiently query matching template parts per route)
- Media image sizes configuration (thumbnail, card, hero dimensions)
- How the catch-all route handles 404s
- Post archive page implementation details
- Mega menu block design (or whether to use nested Link blocks instead)

</decisions>

<specifics>
## Specific Ideas

- Template parts approach inspired by WordPress Elementor's Theme Builder — parts declare display conditions, most specific wins
- Header template part should support: logo, nav links (mega menu capable), CTA button, top announcement bar — all built from blocks
- Footer template part should support: link columns, social links, copyright text — all built from blocks
- The same block system used for page layouts is used for template parts — complete consistency
- Post scheduling similar to WordPress — set a future date and the post auto-publishes

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/blocks/registry.ts`: All 14 atomic blocks registered — ready for use in Pages, Posts, and Template Parts
- `src/blocks/RenderBlocks.tsx`: Block renderer — reusable for page content and template part rendering
- `src/fields/styleOptions.ts`: Complete style field system — applies to blocks in template parts too
- `src/fields/link.ts`: Link field group — useful for navigation links in template parts
- `src/collections/Media.ts`: Basic media collection from template — needs folders, focal point, image sizes
- `src/collections/Users/`: Users collection from template — Posts will reference as author

### Established Patterns
- Block-based layouts via blockReferences to atomicBlockSlugs
- blocksAsJSON for JSONB storage
- Co-located block structure in src/blocks/
- RSC rendering with client components only at leaves

### Integration Points
- `payload.config.ts`: Add Pages, Posts, Categories, Tags, Template Parts collections
- `src/app/(frontend)/[...slug]/page.tsx`: Catch-all route for pages
- `src/app/(frontend)/blog/[slug]/page.tsx`: Blog post single page
- `src/app/(frontend)/layout.tsx`: Template part (header/footer) resolution and rendering

</code_context>

<deferred>
## Deferred Ideas

- Full page templates with dynamic data binding (v2 TMPL-01/TMPL-02) — template parts for site chrome is Phase 3, but full dynamic templates remain v2
- Sidebar template part type — could add later when needed

</deferred>

---

*Phase: 03-collections-content*
*Context gathered: 2026-03-14*
