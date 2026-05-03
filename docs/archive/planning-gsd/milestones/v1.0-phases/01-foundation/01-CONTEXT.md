# Phase 1: Foundation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffold with Payload CMS v3 + Next.js, PostgreSQL with blocksAsJSON storage, block registry pattern (blockReferences + interfaceName), Tailwind v4 + shadcn/ui, and Lexical rich text editor. This phase establishes the infrastructure that all subsequent phases build on.

</domain>

<decisions>
## Implementation Decisions

### Starting Point
- Use `create-payload-app` with the website template flag, then strip back
- Remove all 5 existing blocks (Hero, Content, Media, CTA, Archive) — rebuilding from scratch with atomic system
- Remove their frontend page/post rendering — building our own RSC block renderers
- Keep useful utilities (generateMeta, mergeOpenGraph, getServerSideURL, etc.)
- Strip dark mode toggle
- Strip hero as separate fields — hero is just a section block
- Use latest stable Payload version (whatever create-payload-app installs), keep all @payloadcms/* packages in sync
- Use latest Next.js 16 version (not 15.4.x from template)

### Project Structure
- Blocks: `src/blocks/` — co-located with subdirs per block (each block folder contains config.ts, component.tsx, styles.ts)
- Collections: `src/collections/`
- Globals: `src/globals/`
- Shared fields: `src/fields/`

### Shared Fields
- Single reusable 'styles' group field containing all style properties (padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS)
- Added to every block via the block registry pattern
- Style value input: Hybrid approach — preset dropdown (sm/md/lg/xl mapped to Tailwind spacing) with a 'custom' option revealing a number input
- Color input: Theme palette presets (shadcn/ui colors) + custom color picker as fallback

### shadcn/ui Setup
- Install ALL shadcn/ui components upfront, strip back later if needed
- Default theme (zinc) as starting point
- Block styles map to Tailwind utility classes on the frontend (e.g., padding 'md' → 'p-4')

### Claude's Discretion
- Exact files to keep vs strip from the website template (beyond the explicitly mentioned ones)
- Lexical editor configuration details
- blocksAsJSON and blockReferences configuration specifics
- How to handle the Next.js 16 upgrade from the template's Next.js 15

</decisions>

<specifics>
## Specific Ideas

- Reference implementation for block row labels at: `C:\Projects\personal\luxe\luxe-escorts\src\components\admin\BlockRowLabel.tsx` — to be used in Phase 2 but the pattern informs how blocks are structured
- Layout Customizer plugin at: `C:\Projects\sandbox\payload\payload-customiser` — informs block architecture decisions
- Payload website template is the starting canvas — strip and rebuild, not start from scratch
- AWS SES SMTP is the default email transport (configured in Phase 6 but good to know for payload config structure)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing code in this project yet (greenfield)
- Payload website template provides: generateMeta, mergeOpenGraph, getServerSideURL utilities
- BlockRowLabel component at luxe project provides pattern for rich admin labels (Phase 2)

### Established Patterns
- Payload v3 blockReferences: define blocks once globally, reference by slug in collections
- Payload v3 interfaceName: prevents TypeScript type duplication across block references
- Payload v3 blocksAsJSON: stores block data as JSONB column instead of relational tables

### Integration Points
- payload.config.ts — central config where block registry, collections, globals, plugins are wired
- next.config.mjs — withPayload wrapper for Next.js integration
- Tailwind v4 CSS-first config — `@theme` directive for design tokens

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-14*
