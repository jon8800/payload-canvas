# Payload CMS Starter

## What This Is

A batteries-included Payload CMS v3 starter for building websites of any type. It provides a composable, Shopify-inspired block system with nested atomic blocks, a template engine for dynamic pages, type-safe dynamic data binding, and a cross-platform setup script for instant scaffolding. Built on Next.js App Router with React Server Components, Tailwind v4, and shadcn/ui, with a Webflow-inspired visual admin for per-block styling and a site-wide Theme Settings global that cascades design tokens as CSS variables.

## Core Value

Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates — no predefined rigid sections, just flexible nested blocks, styled visually per-block and themed globally via design tokens.

## Current State

**Shipped:** v1.1 Styling & Theming (2026-04-18)

Running `payload-toolkit` monorepo (Turborepo + pnpm workspaces). `apps/starter` is the Payload CMS + Next.js application; `packages/create-payload-starter` is the CLI scaffolder; `packages/shared` holds cross-cutting utilities. Admin at `/admin`, frontend via Next.js App Router. PostgreSQL with `blocksAsJSON` storage. Tailwind v4 CSS-first (no `tailwind.config`), shadcn/ui components, Base UI primitives for custom admin components, react-colorful for color wheel, full 1908-font Google Fonts catalog in FontSelector.

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
- ✓ Frontend Tailwind v4 CSS renders correctly (Preflight, utilities, shadcn components) — v1.1
- ✓ Webflow-style styles panel — single JSON field with bounding box UI replacing per-field CSS props — v1.1
- ✓ Theme Settings global with JSON token storage and CSS variable cascade via layout.tsx — v1.1
- ✓ Base UI admin primitives (Popover, Slider, Combobox, Collapsible, Select) for all custom admin components — v1.1
- ✓ Monaco CSS editor + tag-chip Tailwind class input in StylesPanel — v1.1
- ✓ Full 1908-font Google Fonts catalog with lazy preview in FontSelector — v1.1
- ✓ react-colorful color wheel + shadcn default values in ColorPicker — v1.1
- ✓ `/style-guide` preview page with ThemeSettings livePreview wiring — v1.1

### Active (v1.2 candidates)

- [ ] Templates collection for dynamic page layouts (Elementor-style)
- [ ] Type-safe dynamic data binding (block properties reference compatible collection field types only)
- [ ] Frontend search UI consuming the Search plugin
- [ ] Per-phase VERIFICATION.md discipline — tech debt from v1.1 (phases 8, 12, 12.1 unverified)
- [ ] Decide Nyquist validation posture — either set up validation contracts or disable `workflow.nyquist_validation`

### Out of Scope

- Frontend auth (login/register pages) — admin panel only for content management
- Mobile app — web only
- Managed hosting vendor lock-in (Vercel-specific features) — must work on VPS/Docker
- Full CSS property abstraction like Webflow — simplified subset only
- Seed data by default — available as optional flag only
- Per-page theme overrides — global theme only; per-page is a future-milestone call
- CSS-in-JS / styled-components — Tailwind v4 + CSS variables
- Dark mode toggle — can be added via theme settings, not in roadmap

## Context

- Based on Payload CMS website template but with significant changes to how layouts work
- Existing custom Layout Customizer plugin at `C:\Projects\sandbox\payload\payload-customiser` — provides a Shopify theme customizer-style view with tree view, drag-drop, live preview, inline block adding
- Payload v3 Postgres adapter supports storing blocks as JSON to avoid schema explosion
- Payload global block references help keep TypeScript types manageable with deeply nested block structures
- Shopify's new theme architecture (global blocks + nested blocks composing sections) is the primary UX inspiration
- Webflow's styling panel is the inspiration for per-block style controls, but simplified
- WordPress Elementor's template system is the reference for dynamic page templates
- Base UI primitives are the admin component baseline; Tailwind is never used in admin context (CSS variables only)
- No test infrastructure exists yet (Nyquist validation in config but unused across both milestones)

## Constraints

- **Tech stack**: Payload CMS v3, Next.js 15 (App Router), React 19, Tailwind v4, shadcn/ui, Base UI, PostgreSQL
- **Package manager**: pnpm
- **Database**: PostgreSQL (local instance for dev, any Postgres for production)
- **Platform**: Setup scripts must work cross-platform (Windows, macOS, Linux)
- **Architecture**: Server Components by default, client components only at leaf nodes
- **Block storage**: Postgres JSON storage for blocks to keep schema clean
- **Deployment**: VPS / Docker (no Vercel-specific features)
- **Admin styling**: SCSS with `@layer payload-default` + Payload CSS variables; no Tailwind utilities in admin context
- **Bundler**: Turbopack (never fall back to webpack)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Nested composable blocks over predefined sections | Flexibility — sections are arrangements of atomic blocks, not rigid templates | ✓ Good — shipped, working well |
| Global block references in Payload | Prevents TypeScript schema bloat with deeply nested blocks | ✓ Good — shipped |
| Postgres JSON storage for blocks | Avoids excessive table joins and type generation | ✓ Good — shipped |
| No special hero fields | Hero is just another section composed of nested blocks | ✓ Good — shipped |
| VPS/Docker deployment target | No vendor lock-in | ✓ Good — shipped |
| Removed tailwind.config.mjs entirely (Tailwind v4 CSS-first) | Single source of truth in globals.css via `@source`/`@theme` | ✓ Good — shipped in v1.1 |
| Single JSON `styles` field per block | Eliminates schema bloat from per-property fields | ✓ Good — shipped in v1.1 |
| ThemeSettings global with auto-derived shadcn variables | 7 input hex colors → full shadcn palette via oklch + hue rotation | ✓ Good — shipped in v1.1 |
| CSS variables injected via `<style>` tag in `<head>` | Cascades to `:root`, functionally equivalent to inline style on `<html>` | ✓ Good — shipped |
| Base UI primitives for all admin custom components | Headless + SCSS avoids Tailwind Preflight conflicts in admin | ✓ Good — shipped in v1.1 |
| Redesign admin components twice (Payload-native then Base UI) | Cleaner result than single-shot rebuild | ✓ Good — retrospective-confirmed |
| react-colorful for color wheel (2KB, zero deps) | Lightweight, purpose-built | ✓ Good — shipped |
| Static 1908-font Google Fonts JSON catalog | Avoids runtime API calls; generated from google-font-metadata data file | ✓ Good — shipped |
| Payload API over raw SQL for block style migration | Cross-adapter compatible, idempotent, reversible | ✓ Good — shipped |
| Templates collection for dynamic pages | Reusable layouts for collection item pages (Elementor-style) | — Pending (deferred to v1.2+) |
| Type-safe dynamic data binding | Block properties can only reference compatible field types | — Pending (deferred to v1.2+) |

## Next Milestone Goals

**v1.2 (not yet scoped)** — likely candidates:
- Templates collection + type-safe dynamic data binding (TMPL-01, TMPL-02)
- Frontend search UI (SRCH-01)
- Close v1.1 tech debt: retrofit VERIFICATION.md for phases 8/12/12.1 or rule it unnecessary; decide Nyquist posture

Run `/gsd-new-milestone` to formally scope.

---
*Last updated: 2026-04-18 after v1.1 milestone close*
