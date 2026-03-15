# Phase 4: Sections & Publishing - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Pre-composed section presets (8 sections as both seed data and admin block presets), full publishing workflow (draft mode, live preview on Pages/Posts/Template Parts, on-demand revalidation), and sitemap/robots.txt generation. Sections are composed from nested atomic blocks — no new block types, just arrangements of existing ones.

</domain>

<decisions>
## Implementation Decisions

### Section Presets
- 8 pre-composed sections: Hero, Content, CTA Banner, Collection Grid, Features, Testimonials, FAQ, Footer CTA
- Each section is an arrangement of existing atomic blocks (Heading, Paragraph, Button, Image, Container, Grid, etc.)
- Dual delivery: seed data (imported via --demo flag in setup script) AND preset insertion in the admin (snippet-style button that inserts pre-configured block arrangements)
- Sections are NOT new block types — they are saved arrangements of existing blocks
- Hero is just a section preset, not a special field type (confirmed from Phase 1)

### Live Preview
- Custom /api/preview route that enables Next.js draft mode and redirects to the page
- Enabled on all content collections with layouts: Pages, Posts, Template Parts
- Uses Payload's built-in live preview with iframe + postMessage
- Auto-save at 300ms (already configured in Phase 3) enables real-time preview updates

### Revalidation
- Page + related revalidation strategy: revalidate the changed page/post + archive pages, homepage, and navigation (template parts)
- afterChange hooks on Pages, Posts, Template Parts collections
- Use revalidatePath for specific routes, revalidateTag for grouped content (e.g., 'posts' tag for blog archive)

### Sitemap & Robots
- Next.js App Router native sitemap.ts and robots.ts
- Sitemap queries all published Pages and Posts
- Robots.txt allows all crawlers by default

### Claude's Discretion
- Exact preset insertion UI mechanism (custom admin component vs Payload's built-in block insertion)
- Sitemap pagination for large sites
- Draft mode cookie handling details
- How live preview resolves template parts in the preview iframe
- Exact revalidation paths for template parts changes

</decisions>

<specifics>
## Specific Ideas

- Section presets should feel like "starter sections" — a user inserts one and then customizes the blocks within it
- The --demo flag seed data should create a sample homepage with several sections to showcase the block system
- Live preview must work with the template parts system — preview should show the correct header/footer for the page being edited

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/blocks/RenderBlocks.tsx`: Block renderer — already handles all 14 block types recursively
- `src/blocks/registry.ts`: All blocks registered with slugs
- `src/utilities/resolveTemplateParts.ts`: Template parts resolution with 4-tier priority
- `src/collections/Pages.ts`, `Posts.ts`, `TemplateParts.ts`: Collections with versions, auto-save, drafts already configured
- `src/lib/blockStyles.ts`: Style-to-Tailwind mapper
- `src/middleware.ts`: x-pathname header for route detection

### Established Patterns
- Versions with `maxPerDoc: 50`, `drafts: { autosave: { interval: 300 } }`
- Block-based layouts via blockReferences to atomicBlockSlugs
- RSC rendering with client components only at leaves
- Template parts resolve per-route based on display conditions

### Integration Points
- `payload.config.ts`: Add live preview config (url, breakpoints)
- `src/app/(frontend)/layout.tsx`: Draft mode integration for live preview
- `src/app/api/preview/route.ts`: Custom preview route handler
- `src/app/(frontend)/sitemap.ts`: Sitemap generation
- `src/app/(frontend)/robots.ts`: Robots.txt generation
- Collection afterChange hooks: Revalidation triggers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-sections-publishing*
*Context gathered: 2026-03-14*
