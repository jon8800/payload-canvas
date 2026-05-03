# Phase 2: Atomic Blocks - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete library of 14 atomic blocks (text, media, action, layout) with per-block styling and settings, each rendering as React Server Components on the frontend. Includes rich block row labels for the admin panel. Sections (pre-composed arrangements of blocks) are Phase 4 — this phase builds the individual building blocks only.

</domain>

<decisions>
## Implementation Decisions

### Block Nesting
- Every block gets a 'children' blocks field — any block can contain child blocks, not just layout blocks
- Maximum nesting depth: 8 levels (matching Shopify)
- Full recursion allowed — a Container can contain another Container, a Heading can contain children, etc.
- Children field references all block types via blockReferences

### Style Field UX
- Three Payload tabs per block: Content | Styles | Settings
- Tailwind spacing scale for presets: none/xs/sm/md/lg/xl/2xl mapped to Tailwind spacing values (0/1/2/4/6/8/12)
- Per-direction spacing control: top, right, bottom, left individually (pt-4 pr-2 pb-4 pl-2)
- Full responsive breakpoints: sm/md/lg/xl overrides per style property
- All 8 style properties: padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS
- Color input: shadcn/ui theme palette presets + custom color picker fallback
- Hybrid value input: preset dropdown with 'custom' option revealing number input

### Block Rendering
- Configurable HTML wrapper tag in Settings tab (e.g., div, section, article, figure, header, etc.)
- Defaults are semantic per block type (Heading → header, Image → figure, etc.)
- Custom CSS escape hatch: two fields — one for extra Tailwind classes (appended), one for raw inline CSS (overrides)
- Style-to-Tailwind mapping: Claude's discretion on approach (utility function vs per-property maps)
- Children rendering: Claude's discretion (direct render vs slot-based)

### Row Labels
- Port and adapt the luxe BlockRowLabel pattern for all 14 block types
- Each block type gets a unique SVG icon (16x16)
- Media thumbnails on: Image, Video, Icon blocks + any parent block shows first image from children
- Text snippets on: Heading (heading text), Paragraph (first line), Button/Link (label text), List/Blockquote (first item)
- Layout blocks (Container, Grid, Spacer, Divider): icon + type name + child count
- Form embed: icon + type name

### Claude's Discretion
- Exact SVG icon designs for each block type
- Style-to-Tailwind mapping implementation approach
- Children rendering strategy (direct vs slot-based)
- How to implement the 8-level nesting depth limit in practice
- Responsive breakpoint field UI structure within the Styles tab

</decisions>

<specifics>
## Specific Ideas

- Reference implementation for row labels: `C:\Projects\personal\luxe\luxe-escorts\src\components\admin\BlockRowLabel.tsx` — use same media caching, thumbnail fetching, and text extraction patterns
- Each block folder co-located: `src/blocks/{name}/config.ts`, `component.tsx`, `styles.ts` (from Phase 1 decision)
- Block registry at `src/blocks/registry.ts` — each new block must be added to allBlocks and the appropriate slug array (atomicBlockSlugs)
- Shared style fields at `src/fields/styleOptions.ts` — skeleton exists, needs all 8 properties + per-direction + responsive breakpoints
- Shopify's nested block architecture is the primary reference for the nesting model

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/blocks/registry.ts`: Empty block registry ready for population — allBlocks[], atomicBlockSlugs[], sectionBlockSlugs[]
- `src/blocks/RenderBlocks.tsx`: Block type → component mapper (needs extension for each new block)
- `src/fields/styleOptions.ts`: Style field skeleton with customCSS only — needs all 8 properties
- `src/components/ui/`: 55 shadcn/ui components available for block settings UI
- `src/lib/utils.ts`: cn() utility for class merging

### Established Patterns
- Payload tabs field for Content/Styles/Settings separation
- blockReferences + interfaceName for clean TypeScript types
- blocksAsJSON for JSONB storage of nested block data
- RSC by default, 'use client' only at leaf interactive nodes

### Integration Points
- `src/blocks/registry.ts` — each block config must be added here
- `src/blocks/RenderBlocks.tsx` — each block renderer must be registered here
- `src/fields/styleOptions.ts` — shared style group consumed by all blocks
- `payload.config.ts` — blocks: allBlocks already wired

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-atomic-blocks*
*Context gathered: 2026-03-14*
