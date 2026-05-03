# Phase 5: Plugins & Integrations - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Install and configure 7 official Payload plugins. Integrate the Layout Customizer directly into the starter codebase (not as a separate plugin). Document Theme Settings integration point for future development. The customizer is a major feature — a Shopify-style visual editor with block tree sidebar, live preview with breakpoints/zoom, and on-canvas block selection.

</domain>

<decisions>
## Implementation Decisions

### Plugin Configuration
- **SEO plugin**: Enabled on Pages and Posts (title, description, OG image)
- **Redirects plugin**: Standard 301/302 redirects AND regex pattern matching (WordPress Redirection plugin-style)
- **Form Builder plugin**: Extended config — standard fields (text, email, textarea, select, checkbox) plus file uploads, multi-step, conditional logic, with email notifications
- **Nested Docs plugin**: Already configured for Categories (Phase 3) — no additional config needed
- **Import/Export plugin**: Standard config, enabled on main collections
- **MCP plugin**: Standard config
- **Search plugin**: Index Pages, Posts, and Categories

### Layout Customizer (integrated into starter)
- Copy customizer source from `C:\Projects\sandbox\payload\payload-customiser\src` into `src/views/customiser/`
- NOT a separate plugin — direct part of the starter codebase
- Configurable: array of collection slugs that get the customizer view tab (default: Pages, Posts, Template Parts)
- Uses Phase 4's RefreshRouteOnSave for live preview (not the plugin's custom postMessage approach) — RSC compatible
- Keep the customizer's UI chrome: breakpoints, zoom, device selector, popup window option
- Remove/replace the duplicated live preview code from the plugin — use Payload's built-in live preview infrastructure
- On-canvas block selection: click + hover highlights
  - Rendered blocks get `data-block-path` attributes (e.g., `data-block-path="sections.0.blocks.2"`)
  - Click handler in preview iframe sends postMessage back to customizer with block path
  - Hover shows subtle outline/highlight on the block
  - Clicking selects the block in the tree sidebar AND opens its settings in the right panel
- Preserves from plugin: block tree sidebar (SectionFields), drag-and-drop via dnd-kit, document fields panel, `_hidden` field for block visibility
- Blocks field name: configurable (default: 'layout' to match our collections)

### Theme Settings Integration Point
- Document the existing shadcn/ui CSS variables as the integration surface (--primary, --secondary, --muted, --accent, etc.)
- Claude's discretion on implementation approach (CSS variables document, config file, or both)
- This is a documentation/architecture decision, not a full plugin implementation

### Claude's Discretion
- Exact restructuring of the customizer code when moving it into the starter
- How to wire the customizer into collection admin views without the plugin factory pattern
- Live preview integration details (removing postMessage, wiring RefreshRouteOnSave)
- How to inject the click/hover handler script into the preview iframe
- Import/Export and MCP plugin configuration details
- Theme Settings documentation format

</decisions>

<specifics>
## Specific Ideas

- Customizer source at: `C:\Projects\sandbox\payload\payload-customiser\src` — copy and adapt
- The customizer's live preview had its own iframe + postMessage system duplicating Payload's — replace with the built-in RefreshRouteOnSave approach from Phase 4
- On-canvas interaction (click to select, hover to highlight) is the Shopify experience — data attributes on rendered blocks enable this
- Inline text editing on canvas is deferred — too complex with RSC refresh cycle for v1
- WordPress Redirection plugin is the reference for the redirects feature (both standard and regex)
- Form Builder extended mode enables file uploads, multi-step forms, and conditional logic

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/LivePreviewListener.tsx`: RefreshRouteOnSave component from Phase 4
- `src/utilities/generatePreviewPath.ts`: Preview URL generator for collections
- `src/blocks/registry.ts`: Block registry with all slugs — customizer needs this
- `src/blocks/RenderBlocks.tsx`: Block renderer — needs data-block-path attributes for on-canvas selection
- All 14 block component.tsx files: Need data-block-path attribute additions
- `src/app/(frontend)/layout.tsx`: Already has LivePreviewListener + template parts

### Established Patterns
- Live preview via RefreshRouteOnSave + auto-save at 300ms
- Draft mode via /next/preview and /next/exit-preview routes
- Block rendering as RSC with getBlockStyles()
- Template parts resolution via resolveTemplateParts.ts

### Integration Points
- `payload.config.ts`: Add 7 plugins + customizer view registration
- Collection configs (Pages, Posts, TemplateParts): Add customizer view tab
- Block components: Add data-block-path prop for on-canvas selection
- `src/views/customiser/`: New directory for customizer code

### External Source
- `C:\Projects\sandbox\payload\payload-customiser\src/`: Full customizer source to copy and adapt
  - `views/Customiser/`: Main 3-pane layout (tree + preview + fields)
  - `views/Customiser/SectionFields/`: Block tree with drag-drop (dnd-kit)
  - `views/Customiser/LivePreview/`: Preview chrome (breakpoints, zoom, device selector) — KEEP UI, REPLACE preview mechanism
  - `views/Customiser/DocumentFields.tsx`: Selected block field editor
  - `components/BlocksTreeView/`: Tree view components
  - `index.ts`: Plugin factory — REPLACE with direct collection config

</code_context>

<deferred>
## Deferred Ideas

- Inline text editing on canvas — deferred due to RSC refresh complexity, add in future iteration
- Theme Settings full plugin — v2, only documenting the integration surface now

</deferred>

---

*Phase: 05-plugins-integrations*
*Context gathered: 2026-03-14*
