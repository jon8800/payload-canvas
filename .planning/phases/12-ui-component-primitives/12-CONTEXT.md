# Phase 12: UI Component Primitives - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild all custom admin field components (StylesPanel, ColorPicker, SliderField, FontSelector) using Base UI headless primitives styled with SCSS and Payload CSS variables. Components must look native to Payload admin, work in light/dark themes, and match the quality bar of Framer/Linear property panels. BlockRowLabel stays as-is.

</domain>

<decisions>
## Implementation Decisions

### Primitive Library
- **D-01:** Use @base-ui/react (v1.3.0, already installed) as the headless primitive layer
- **D-02:** No Radix UI, no shadcn/ui in admin — Base UI only
- **D-03:** No Tailwind CSS in admin context — avoids Preflight conflicts with Payload's SCSS

### Styling Strategy
- **D-04:** SCSS files with Payload CSS variables (--theme-elevation-*, --theme-text, --base, --border-radius-m)
- **D-05:** Direct SCSS imports in components (no CSS provider needed)
- **D-06:** @layer payload-default wrapper for specificity consistency
- **D-07:** All components must work automatically in Payload's light and dark admin themes via CSS variables

### Component Scope — Rebuild These 4
- **D-08:** StylesPanel (604 lines) — complete rebuild with Framer-style compact property panel
- **D-09:** ColorPicker (80 lines) — replace native input with Base UI Popover + custom color panel
- **D-10:** SliderField (96 lines) — replace native range with Base UI Slider
- **D-11:** FontSelector (260 lines) — replace hand-built dropdown with Base UI Select/Combobox + font preview
- **D-12:** BlockRowLabel stays as-is (display logic only, no interactive primitives needed)

### StylesPanel Redesign
- **D-13:** Framer-style compact layout: label and value on the same row, not stacked
- **D-14:** Padding/margin control: compact number inputs with toggle between uniform (all sides) and per-side mode — like Framer's padding control with the square/individual icons
- **D-15:** Replace the current oversized bounding box with Framer-style compact inline controls — no nested colored boxes
- **D-16:** Collapsible sections with +/- or chevron toggles for property groups (not the current full-width accordion bars)
- **D-17:** Property groups: Spacing (padding + margin), Border (radius + width), Typography (text size), Colors (background + text), Custom CSS (code editor + class tokens)
- **D-18:** Monaco CodeEditor stays for custom CSS (already using Payload's CodeEditor)
- **D-19:** Tag-based class token input stays (chip add/remove pattern)

### ColorPicker Redesign
- **D-20:** Base UI Popover for color picker panel (click swatch to open)
- **D-21:** Color swatch preview + hex text input inline (like current but polished)
- **D-22:** No native <input type="color"> — custom panel with hue/saturation controls or at minimum a polished swatch + hex input

### SliderField Redesign
- **D-23:** Base UI Slider component replacing native <input type="range">
- **D-24:** Slider track + thumb styled with Payload CSS variables
- **D-25:** Number input alongside slider for precise values (Framer-style: value box + slider on same row)

### FontSelector Redesign
- **D-26:** Base UI Combobox for searchable font dropdown
- **D-27:** Font preview in the dropdown — each option rendered in its actual font face
- **D-28:** Load font previews from Google Fonts API (CSS link injection for visible options)
- **D-29:** Expand from 50 curated fonts to full Google Fonts catalog (or at least 200+ popular ones)
- **D-30:** Research if there's a package that provides the Google Fonts metadata list without runtime API calls

### Theme Settings Layout
- **D-31:** Theme settings fields should NOT be full-width — use a max-width container or two-column layout
- **D-32:** Color fields should be compact: swatch + hex input inline, not full-width rows
- **D-33:** Slider fields should be compact: label + slider + value on one row (Framer-style)
- **D-34:** Group fields visually with subtle section headers (Colors, Fonts, Spacing, Border Radius)

### Quality Bar
- **D-35:** Primary reference: Framer visual builder property panels (screenshots provided)
- **D-36:** Secondary reference: Linear UI (golden standard for polish)
- **D-37:** Components must feel like they belong in Payload admin — not bolted on
- **D-38:** Smooth transitions, proper hover states, focus rings that match Payload's design language
- **D-39:** Compact and dense — not wasteful with vertical space

### Claude's Discretion
- Exact Base UI component selection for each use case
- Animation/transition timing
- Exact SCSS architecture (one file per component vs shared)
- How to lazy-load Google Fonts for preview (intersection observer, viewport-based, etc.)

</decisions>

<specifics>
## Specific Ideas

- Framer visual builder sidebar is the primary design reference (screenshots provided by user showing property panel, padding control, and collapsible sections)
- Framer padding control: toggle icon switches between "all sides same" and "per-side" mode with 4 compact number inputs labeled T R B L
- Current bounding box (screenshot 3) is "all over the place, not center aligned, spacing is off, too large"
- Current theme settings (screenshot 4) is "horrendous UI — too long, too full width, sliders look horrible because native, really cheap"
- Google Font picker "kinda sucks" — doesn't feel like it fetches all fonts, no font preview in picker
- Linear is the "golden standard for UX"
- Webflow is good but "a bit too compact to my liking"

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Existing components to rebuild
- `apps/starter/src/components/admin/StylesPanel.tsx` — Current 604-line styles panel
- `apps/starter/src/components/admin/StylesPanel.scss` — Current 275-line SCSS
- `apps/starter/src/fields/theme/ColorPicker.tsx` — Current 80-line color picker
- `apps/starter/src/fields/theme/SliderField.tsx` — Current 96-line slider
- `apps/starter/src/fields/theme/FontSelector.tsx` — Current 260-line font selector

### Payload admin styling reference
- `apps/starter/src/views/customiser/index.scss` — Customizer layout styles
- `apps/starter/src/views/customiser/DocumentFields.scss` — Sidebar field styles

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@base-ui/react` v1.3.0 — already installed, ready to use
- `@payloadcms/ui` CodeEditor — Monaco-based, already integrated for custom CSS
- `useField` hook from @payloadcms/ui — field state management, keep using
- `stylesField.ts` factory — returns JSON field config with component path, stays

### Established Patterns
- SCSS with @layer payload-default — all admin custom styles use this
- Payload CSS variables — --theme-elevation-{0-900}, --theme-text, --base, --border-radius-*
- Component path registration via admin.components.Field in field configs
- 'use client' directive required for interactive admin components

### Integration Points
- StylesPanel registers via `stylesField()` factory in `src/fields/stylesField.ts`
- Theme fields register via field path strings in `src/globals/ThemeSettings.ts`
- All components use `useField` hook for reading/writing field values
- Data format (StylesData, theme token shapes) must NOT change — only UI changes

</code_context>

<deferred>
## Deferred Ideas

- Full Google Fonts API integration with dynamic loading — may be too complex for this phase, evaluate during research
- HSL/OKLCH color space picker with visual gradient — could be a future enhancement
- Responsive style overrides in the UI (sm/md/lg breakpoint controls) — noted in Phase 9, deferred again

</deferred>

---

*Phase: 12-ui-component-primitives*
*Context gathered: 2026-03-21*
