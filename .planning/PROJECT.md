# Payload CMS Starter

## What This Is

A batteries-included Payload CMS v3 starter for building websites of any type. It provides a composable, Shopify-inspired block system with nested atomic blocks, a template engine for dynamic pages, type-safe dynamic data binding, and a cross-platform setup script for instant scaffolding. Built on Next.js App Router with React Server Components, Tailwind v4, and shadcn/ui.

## Core Value

Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates — no predefined rigid sections, just flexible nested blocks.

## Requirements

### Validated

- ✓ Composable nested block system (14 atomic blocks, nested composition) — v1.0
- ✓ Per-block style options and settings tabs — v1.0
- ✓ 8 pre-composed section presets (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) — v1.0
- ✓ Pages, Posts, Media, Template Parts collections with versions, drafts, trash — v1.0
- ✓ Payload global block references + Postgres JSON storage — v1.0
- ✓ 7 official plugins (SEO, Form Builder, Redirects, Nested Docs, Import/Export, MCP, Search) — v1.0
- ✓ Layout Customizer 3-pane visual editor — v1.0
- ✓ Cross-platform setup script, demo content, Docker deployment — v1.0
- ✓ Next.js App Router with RSC, Tailwind v4 + shadcn/ui — v1.0
- ✓ Turborepo monorepo with create-payload-starter CLI — v1.0

### Active

- [ ] Frontend Tailwind v4 CSS fix (Preflight, utilities, shadcn components not loading on frontend pages)
- [ ] Webflow-style styles panel (single JSON field with custom bounding box UI replacing per-field CSS properties)
- [ ] Theme Settings global (admin view for managing theme variables — colors, fonts, spacing, radius — stored as JSON, feeding CSS variables)

### Future

- [ ] Templates collection for dynamic page layouts (Elementor-style)
- [ ] Type-safe dynamic data binding (block properties reference compatible collection fields)
- [ ] Frontend search UI for Search plugin

### Out of Scope

- Frontend auth (login/register pages) — admin panel only for content management
- Mobile app — web only
- Managed hosting vendor lock-in (Vercel-specific features) — must work on VPS/Docker
- Full CSS property abstraction like Webflow — simplified subset only
- Seed data by default — available as optional flag only

## Context

- Based on Payload CMS website template but with significant changes to how layouts work
- Existing custom Layout Customizer plugin at `C:\Projects\sandbox\payload\payload-customiser` — provides a Shopify theme customizer-style view with tree view, drag-drop, live preview, inline block adding
- The customizer plugin is already well-developed (React 19, dnd-kit, responsive preview, block visibility toggling)
- Payload v3 Postgres adapter supports storing blocks as JSON to avoid schema explosion
- Payload global block references help keep TypeScript types manageable with deeply nested block structures
- Shopify's new theme architecture (global blocks + nested blocks composing sections) is the primary UX inspiration
- Webflow's styling panel is the inspiration for per-block style controls, but simplified
- WordPress Elementor's template system is the reference for dynamic page templates

## Constraints

- **Tech stack**: Payload CMS v3, Next.js 15 (App Router), React 19, Tailwind v4, shadcn/ui, PostgreSQL
- **Package manager**: pnpm
- **Database**: PostgreSQL (local instance for dev, any Postgres for production)
- **Platform**: Setup scripts must work cross-platform (Windows, macOS, Linux)
- **Architecture**: Server Components by default, client components only at leaf nodes
- **Block storage**: Postgres JSON storage for blocks to keep schema clean
- **Deployment**: VPS / Docker (no Vercel-specific features)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Nested composable blocks over predefined sections | Flexibility — sections are just arrangements of atomic blocks, not rigid templates | — Pending |
| Global block references in Payload | Prevents TypeScript schema bloat with deeply nested blocks | — Pending |
| Postgres JSON storage for blocks | Avoids excessive table joins and type generation for block data | — Pending |
| Templates collection for dynamic pages | Allows building reusable layouts for collection item pages (like Elementor) | — Pending |
| Type-safe dynamic data binding | Block properties can only reference compatible field types — prevents broken references | — Pending |
| No special hero fields | Hero is just another section composed of nested blocks, consistent with the system | — Pending |
| VPS/Docker deployment target | No vendor lock-in, self-hosted flexibility | — Pending |

## Current Milestone: v1.1 Styling & Theming

**Goal:** Fix frontend CSS, replace per-field styles with Webflow-inspired JSON panel, add Theme Settings global for site-wide design control.

---
*Last updated: 2026-03-15 after v1.1 milestone start*
