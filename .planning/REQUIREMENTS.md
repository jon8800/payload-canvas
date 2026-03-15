# Requirements: Payload CMS Starter

**Defined:** 2026-03-15
**Core Value:** Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates

## v1.1 Requirements

### Frontend Styling

- [x] **STYLE-01**: Frontend pages render with Tailwind v4 Preflight reset (proper fonts, heading sizes, base styles)
- [x] **STYLE-02**: Block components apply configured style properties (padding, margin, colors, etc.) visually on frontend
- [x] **STYLE-03**: shadcn/ui components render correctly on frontend pages (buttons, forms, cards)

### Styles Panel

- [ ] **PANEL-01**: Per-block styles stored as single JSON field instead of individual Payload fields
- [x] **PANEL-02**: Custom admin component with Webflow-style bounding box UI for margin and padding (4-side editing)
- [x] **PANEL-03**: Collapsible property groups for border, typography, colors, and custom CSS
- [ ] **PANEL-04**: Style changes persist and render correctly on frontend
- [x] **PANEL-05**: Existing block style data migrated to new JSON format

### Theme Settings

- [x] **THEME-01**: Theme Settings global with JSON field storing site-wide design tokens (colors, fonts, spacing, border radius)
- [x] **THEME-02**: Custom admin view for editing theme values visually
- [ ] **THEME-03**: Theme values injected as CSS variables on frontend pages via layout.tsx
- [ ] **THEME-04**: shadcn/ui components respect theme CSS variables

## Future Requirements

### Templates & Dynamic Content

- **TMPL-01**: Templates collection for dynamic page layouts (Elementor-style)
- **TMPL-02**: Type-safe dynamic data binding (block properties reference compatible collection field types only)

### Search

- **SRCH-01**: Frontend search UI consuming the Search plugin

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full CSS property abstraction (Webflow-level) | Simplified subset — exponential complexity |
| Per-page theme overrides | Global theme only for v1.1; per-page theming is v2 |
| CSS-in-JS or styled-components | Tailwind v4 CSS-first approach, CSS variables only |
| Dark mode toggle | Not in scope for v1.1 — can be added via theme settings later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STYLE-01 | Phase 8 | Complete |
| STYLE-02 | Phase 8 | Complete |
| STYLE-03 | Phase 8 | Complete |
| PANEL-01 | Phase 9 | Pending |
| PANEL-02 | Phase 9 | Complete |
| PANEL-03 | Phase 9 | Complete |
| PANEL-04 | Phase 9 | Pending |
| PANEL-05 | Phase 9 | Complete |
| THEME-01 | Phase 10 | Complete |
| THEME-02 | Phase 10 | Complete |
| THEME-03 | Phase 10 | Pending |
| THEME-04 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after v1.1 roadmap creation*
