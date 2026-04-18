# Milestones

## v1.0 MVP (Shipped: 2026-03-15)

**Phases completed:** 8 phases, 24 plans, 0 tasks

**Key accomplishments:**
- Composable block system with 14 atomic blocks, per-block styles/settings, and nested composition
- Full content management (Pages, Posts, Media, Template Parts) with versions, drafts, and live preview
- 7 Payload plugins integrated (SEO, Redirects, Form Builder, Nested Docs, Import/Export, MCP, Search)
- Layout Customizer 3-pane visual editor with block tree, live preview, and field editing
- Cross-platform setup CLI with demo content seeding and Docker deployment
- Turborepo monorepo with shared utilities and create-payload-starter CLI package

---

## v1.1 Styling & Theming (Shipped: 2026-04-18)

**Phases completed:** 6 phases (8, 9, 10, 11, 12, 12.1), 16 plans, 2 quick tasks

**Timeline:** 2026-03-15 → 2026-04-18 (active work: 2026-03-15 → 2026-03-21)

**Key accomplishments:**
- Tailwind v4 `@source` directives fix frontend utility compilation (91 → 6839 generated CSS lines)
- Single JSON `styles` field per block with Webflow-inspired bounding box admin UI and data migration
- ThemeSettings global: site-wide design tokens (colors/fonts/spacing/radius) auto-derived into shadcn CSS variables and injected via layout.tsx
- Custom admin field components (ColorPicker, FontSelector, SliderField) rebuilt with Base UI primitives and Payload-native styling
- Full 1908-font Google Fonts catalog in FontSelector with lazy preview; react-colorful color wheel in ColorPicker
- `/style-guide` preview page with ThemeSettings `livePreview` wiring for real-time theme editing

**Key decisions (archived in milestones/v1.1-ROADMAP.md):**
- Redesigned admin components twice — first Payload-native, then Base UI primitives — cleaner than one-shot rebuild
- CSS variables injected via `<style>` tag in `<head>` (cascade to `:root`), not inline `style` on `<html>`
- Payload API over raw SQL for block style migration — cross-adapter compatible
- Base UI + SCSS + `@layer payload-default` pattern for admin components without Tailwind Preflight conflicts

**Known deferred items at close:**
- Phase 10 human verification (4 manual admin-panel tests listed but never run)
- VERIFICATION.md missing for phases 8, 12, 12.1 (integration checker verified wiring retroactively)
- Nyquist validation never set up (5/6 phases missing VALIDATION.md)
- See `.planning/milestones/v1.1-MILESTONE-AUDIT.md` for the full audit report

**Post-audit fix:** `23d3250` — made `collection` optional on `/next/preview` route so ThemeSettings livePreview handshake works for globals.

---
