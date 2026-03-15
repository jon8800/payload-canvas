# Payload CMS Starter

## What This Is

A batteries-included Payload CMS v3 starter for building websites of any type. It provides a composable, Shopify-inspired block system with nested atomic blocks, a template engine for dynamic pages, type-safe dynamic data binding, and a cross-platform setup script for instant scaffolding. Built on Next.js App Router with React Server Components, Tailwind v4, and shadcn/ui.

## Core Value

Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates — no predefined rigid sections, just flexible nested blocks.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Composable nested block system (atomic blocks composed into sections, Shopify-style)
- [ ] Atomic text blocks: Heading, Paragraph, List, Blockquote
- [ ] Atomic media blocks: Image, Video, Icon
- [ ] Atomic action blocks: Button, Link, Form embed
- [ ] Atomic layout blocks: Container, Grid/Columns, Spacer, Divider
- [ ] Per-block style options (padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS)
- [ ] Per-block settings tab (heading tag h1-h6, block-type-specific settings)
- [ ] 5-8 pre-composed sections (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer)
- [ ] Sections are composed from nested blocks (no special hero fields or hardcoded section structures)
- [ ] Payload global block references to keep TypeScript schema clean
- [ ] Postgres JSON storage for blocks (Payload Postgres adapter feature)
- [ ] Templates collection for dynamic page layouts (single post, single product, etc.)
- [ ] Type-safe dynamic data binding — block properties reference compatible collection fields only (text→text, image→upload, richtext→richtext)
- [ ] Pages collection with block-based layouts
- [ ] Posts/Blog collection with categories and tags
- [ ] Media collection with alt text and captions
- [ ] Navigation globals (header/footer menus)
- [ ] Official plugins: SEO, Form Builder, Redirects, Nested Docs
- [ ] Integration point for custom Layout Customizer view plugin (from payload-customiser project)
- [ ] Integration point for future Theme Settings plugin (shadcn theme variables)
- [ ] Cross-platform setup script: Postgres DB creation, .env generation, dependency install + migration
- [ ] Optional demo content flag in setup script
- [ ] VPS / Docker deployment support
- [ ] Next.js App Router with RSC, client components only at leaf nodes
- [ ] Tailwind v4 + shadcn/ui components
- [ ] Public site only — no frontend auth (admin panel only)

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

---
*Last updated: 2026-03-14 after initialization*
