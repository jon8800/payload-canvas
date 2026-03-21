# Roadmap: Payload CMS Starter

## Milestones

- **v1.0 MVP** — Phases 1-7 (shipped 2026-03-15) — [Full details](milestones/v1.0-ROADMAP.md)
- **v1.1 Styling & Theming** — Phases 8-10 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-15</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 2: Atomic Blocks (4/4 plans) — completed 2026-03-14
- [x] Phase 3: Collections & Content (3/3 plans) — completed 2026-03-14
- [x] Phase 4: Sections & Publishing (2/2 plans) — completed 2026-03-14
- [x] Phase 5: Plugins & Integrations (3/3 plans) — completed 2026-03-14
- [x] Phase 6: Developer Experience (5/5 plans) — completed 2026-03-15
- [x] Phase 6.1: Monorepo Restructure (3/3 plans) — completed 2026-03-15
- [x] Phase 7: Gap Closure & Cleanup (2/2 plans) — completed 2026-03-15

</details>

### v1.1 Styling & Theming

- [x] **Phase 8: Frontend Styling Fix** - Fix Tailwind v4 Preflight, block style rendering, and shadcn/ui on frontend pages
- [x] **Phase 9: Styles Panel** - Replace per-field style properties with single JSON field and Webflow-style bounding box UI (completed 2026-03-15)
- [x] **Phase 10: Theme Settings** - Global design token system with admin editor and CSS variable injection (completed 2026-03-15)
- [x] **Phase 11: Admin Component Redesign** - Webflow-inspired redesign of styles panel and theme field components with Payload-native aesthetic (completed 2026-03-15)
- [x] **Phase 12: UI Component Primitives** - Rebuild admin components with headless primitives (Base UI) and Payload-compatible styling (completed 2026-03-21)
- [ ] **Phase 12.1: UI Iteration Fixes** - Base UI selects, color wheel, font dropdown width, default colors, live preview (INSERTED)

## Phase Details

### Phase 8: Frontend Styling Fix
**Goal**: Frontend pages render with correct base styles, block styles apply visually, and shadcn/ui components work
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: STYLE-01, STYLE-02, STYLE-03
**Success Criteria** (what must be TRUE):
  1. Frontend pages show proper heading sizes, font stacks, and Tailwind Preflight reset styles
  2. Block components with configured padding, margin, or color values display those styles on the rendered frontend page
  3. shadcn/ui Button, Card, and Form components render with correct styling on frontend pages (not just admin)
**Plans**: 1 plan
Plans:
- [x] 08-01-PLAN.md — Fix Tailwind v4 content scanning with @source directives

### Phase 9: Styles Panel
**Goal**: Block styles are stored as a single JSON field and edited through a Webflow-inspired visual panel in the admin
**Depends on**: Phase 8 (frontend styles must render correctly before refactoring the style system)
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05
**Success Criteria** (what must be TRUE):
  1. Each block stores its style configuration in a single JSON field instead of individual Payload fields for each CSS property
  2. Admin users can edit margin and padding via a visual bounding box UI with per-side controls (top, right, bottom, left)
  3. Admin users can expand collapsible groups for border, typography, colors, and custom CSS to configure additional style properties
  4. Style changes made in the admin panel persist on save and render correctly on the frontend page
  5. Existing blocks with old per-field style data continue to render correctly after migration to the new JSON format
**Plans**: 3 plans
Plans:
- [ ] 09-01-PLAN.md — Styles JSON field factory and Webflow-style bounding box admin component
- [ ] 09-02-PLAN.md — Wire stylesField into all 14 block configs and update frontend components
- [ ] 09-03-PLAN.md — Migration script for existing block style data to JSON format

### Phase 10: Theme Settings
**Goal**: Site-wide design tokens (colors, fonts, spacing, border radius) are managed through a Theme Settings global and applied via CSS variables
**Depends on**: Phase 8 (CSS variable injection requires working frontend styles); Phase 9 recommended but not blocking
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04
**Success Criteria** (what must be TRUE):
  1. A Theme Settings global exists in the admin with a JSON field storing design tokens for colors, fonts, spacing, and border radius
  2. Admin users can edit theme values through a dedicated visual admin view (not raw JSON editing)
  3. Theme values appear as CSS custom properties (e.g., --color-primary, --font-body) on frontend pages via layout.tsx
  4. shadcn/ui components on the frontend respond to theme CSS variable changes (e.g., changing primary color updates buttons)
**Plans**: 3 plans
Plans:
- [ ] 10-01-PLAN.md — ThemeSettings global, color derivation utilities, and revalidation hook
- [ ] 10-02-PLAN.md — Custom admin field components (ColorPicker, FontSelector, SliderField)
- [ ] 10-03-PLAN.md — Frontend CSS variable injection in layout.tsx

### Phase 11: Admin Component Redesign
**Goal**: All custom admin field components (styles panel + theme settings) redesigned to be professional, Webflow-inspired, and native to Payload admin UI
**Depends on**: Phase 9, Phase 10
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. StylesPanel bounding box is Webflow-inspired — centered, clean, no multi-color margin/padding distinction
  2. CSS custom input uses a code editor with syntax highlighting (Payload's code field component or equivalent)
  3. Tailwind classes input uses tag-based tokens (add/remove chips, not plain text)
  4. Theme field components (ColorPicker, SliderField, FontSelector) look native to Payload admin with CSS variables
  5. Customizer right sidebar has no excess horizontal padding
**Plans**: 2 plans
Plans:
- [x] 11-01-PLAN.md — Redesign StylesPanel: Webflow bounding box, Monaco CSS editor, tag-based class input
- [x] 11-02-PLAN.md — Redesign theme field components with Payload CSS variables + fix sidebar padding

### Phase 12: UI Component Primitives
**Goal**: Rebuild admin UI components using headless primitives (Base UI) with Payload-compatible SCSS styling — no Tailwind Preflight conflicts
**Depends on**: Phase 11
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. StylesPanel uses Base UI Collapsible for property groups and Framer-style compact spacing controls with uniform/per-side toggle
  2. ColorPicker uses Base UI Popover with preset color swatches — no native browser color picker
  3. SliderField uses Base UI Slider with styled track/thumb — no native browser range input
  4. FontSelector uses Base UI searchable dropdown with full 1700+ Google Fonts catalog and lazy font preview
  5. Theme settings fields are compact and visually grouped, not full-width sprawl
**Plans**: 4 plans
Plans:
- [x] 12-01-PLAN.md — Rebuild StylesPanel with Framer-style compact controls and Base UI Collapsible
- [x] 12-02-PLAN.md — Rebuild ColorPicker with Base UI Popover and SliderField with Base UI Slider
- [x] 12-03-PLAN.md — Rebuild FontSelector with Base UI Combobox and full Google Fonts catalog
- [x] 12-04-PLAN.md — Theme settings layout + visual verification checkpoint

### Phase 12.1: UI Iteration Fixes (INSERTED)
**Goal:** Fix visual bugs and add enhancements identified during Phase 12 visual inspection
**Depends on:** Phase 12
**Requirements:** UI-01, UI-04 (iteration on existing requirements)
**Success Criteria** (what must be TRUE):
  1. All select/dropdown inputs use Base UI Select — no native browser selects remain
  2. FontSelector dropdown stretches to full input width
  3. ColorPicker has a color wheel with preset swatches (not swatches-only)
  4. Default theme colors match shadcn variables from frontend globals.css
  5. Theme Settings global has live preview pointing to a style guide preview page
**Plans**: 3 plans
Plans:
- [x] 12.1-01-PLAN.md — Replace native selects with Base UI Select + fix FontSelector dropdown width
- [x] 12.1-02-PLAN.md — Add color wheel to ColorPicker + set default theme colors from globals.css
- [ ] 12.1-03-PLAN.md — Live preview for ThemeSettings + style guide preview page

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. Atomic Blocks | v1.0 | 4/4 | Complete | 2026-03-14 |
| 3. Collections & Content | v1.0 | 3/3 | Complete | 2026-03-14 |
| 4. Sections & Publishing | v1.0 | 2/2 | Complete | 2026-03-14 |
| 5. Plugins & Integrations | v1.0 | 3/3 | Complete | 2026-03-14 |
| 6. Developer Experience | v1.0 | 5/5 | Complete | 2026-03-15 |
| 6.1 Monorepo Restructure | v1.0 | 3/3 | Complete | 2026-03-15 |
| 7. Gap Closure & Cleanup | v1.0 | 2/2 | Complete | 2026-03-15 |
| 8. Frontend Styling Fix | v1.1 | 1/1 | Complete | 2026-03-15 |
| 9. Styles Panel | v1.1 | 3/3 | Complete | 2026-03-15 |
| 10. Theme Settings | v1.1 | 3/3 | Complete | 2026-03-15 |
| 11. Admin Component Redesign | v1.1 | Complete | 2026-03-15 | 2026-03-15 |
| 12. UI Component Primitives | v1.1 | 4/4 | Complete | 2026-03-21 |
| 12.1 UI Iteration Fixes | v1.1 | 2/3 | In Progress|  |
