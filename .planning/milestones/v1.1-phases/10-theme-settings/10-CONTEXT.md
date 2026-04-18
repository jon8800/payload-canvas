# Phase 10: Theme Settings - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Site-wide design tokens (colors, fonts, spacing, border radius) managed through a Theme Settings Payload global and applied via CSS variables on the frontend. Admin edits tokens through custom field components with visual controls. Per-page theme overrides are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Token categories
- Four categories: Colors, Fonts, Spacing scale, Border radius
- Colors: core set of ~6 (primary, secondary, accent, muted, destructive, background/foreground) — admin edits these
- Auto-derived colors: card, popover, sidebar, chart colors computed from core set at save time via afterChange hook
- Fonts: Google Fonts with search/browse — both sans and mono families
- Spacing: base spacing multiplier controlling what xs/sm/md/lg/xl/2xl map to in styleOptions.ts
- Border radius: global --radius value (currently 0.625rem), shadcn derives sm/md/lg/xl from it

### Default values
- Current globals.css values serve as fallback when no theme is configured
- Theme Settings only overrides what admin explicitly changes
- Zero-config works out of the box with existing shadcn/ui defaults

### Admin editing experience
- Payload global (like SiteSettings) with custom React field components, not a standalone admin view
- Leverage Payload's native live preview to preview theme changes on frontend
- Color input: visual color picker + hex text input
- Spacing and border radius: range slider + number input
- Token groups organized by category (Colors, Fonts, Spacing, Border Radius) as collapsible sections

### CSS variable injection
- Fetch theme global in layout.tsx, output CSS variables as inline style on `<html>` element
- Override :root variables only — globals.css @theme inline block already maps --color-primary to var(--primary), so Tailwind utilities automatically pick up changes
- Google Fonts loaded via CSS link tags with preconnect hints (next/font/google cannot load dynamic CMS-selected fonts — requires build-time static calls). Geist stays as static fallback.
- Fetch + revalidate caching: theme fetched once, revalidated when admin saves via Payload afterChange hook

### Token naming & storage
- Mirror exact shadcn/ui variable names (--primary, --background, --radius, etc.) — drop-in overrides
- Admin inputs hex colors, system converts to oklch for storage and CSS output (matching globals.css format)
- Derived colors (card, popover, sidebar) computed at save time and stored in JSON — no render-time computation

### Claude's Discretion
- Exact color derivation algorithm (how card/popover/sidebar derive from core colors)
- oklch conversion implementation
- Google Fonts search UI component details
- Slider component implementation for spacing/radius
- afterChange hook revalidation mechanism

</decisions>

<specifics>
## Specific Ideas

- Use Payload's native live preview for the theme global — since it's a standard global, this comes for free
- The existing colorPresets in styleOptions.ts (primary, secondary, muted, accent, etc.) should reference the same tokens the theme controls — theme changes should flow through to block color presets automatically

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `globals.css`: Already defines all shadcn/ui CSS variables in :root with oklch values and @theme inline mapping
- `SiteSettings` global: Pattern for creating Payload globals with access control
- `styleOptions.ts`: colorPresets reference semantic tokens (primary, secondary, etc.) — these are the consumer of theme values
- Layout Customizer views: Pattern for custom React admin components

### Established Patterns
- Tailwind v4 CSS-first approach (no tailwind.config.mjs) — all theme values via CSS variables
- @theme inline in globals.css maps --color-* to var(--*) for Tailwind utility support
- Custom color values produce inline styles for hex/rgb support (v1.0 decision)
- Geist Sans/Mono loaded via geist package in layout.tsx

### Integration Points
- `layout.tsx` (frontend): Where CSS variable injection happens — currently renders html with Geist font classes
- `globals.css`: :root block is the fallback values that theme overrides
- `payload.config.ts`: globals array where ThemeSettings global gets registered
- `styleOptions.ts` colorPresets: Consumer of semantic color tokens

</code_context>

<deferred>
## Deferred Ideas

- Dark mode toggle — can be layered on top of theme settings later
- Per-page theme overrides — explicitly out of scope for v1.1
- Theme import/export (share themes as JSON files)
- Theme presets gallery (pick from curated themes)

</deferred>

---

*Phase: 10-theme-settings*
*Context gathered: 2026-03-15*
