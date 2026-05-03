# Feature Research

**Domain:** CMS website starter with composable block-based page builder (Payload CMS v3)
**Researched:** 2026-03-14
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a CMS website starter. Missing these and the starter feels broken or incomplete compared to Payload's own official template and competitors like WordPress/Elementor or Webflow.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pages collection with layout builder | Every CMS starter has composable pages; Payload's official template includes this | MEDIUM | Core of the product -- blocks field on pages |
| Posts/Blog collection with categories and tags | Standard content type in every CMS starter; Payload official template includes posts + categories | LOW | Use Nested Docs plugin for hierarchical categories |
| Media collection with image sizes and focal point | Payload official template includes pre-configured sizes and focal point; expected for any image-heavy site | LOW | Payload handles this natively with upload collection |
| Header and Footer globals | Navigation is fundamental; official template ships header + footer globals | LOW | Nav links with nested dropdown support |
| SEO fields on pages and posts | Every headless CMS checklist lists SEO as must-have; Payload has official SEO plugin | LOW | Use `@payloadcms/plugin-seo` -- title, description, og:image |
| Draft mode and preview | Content editors expect to preview before publishing; official template supports drafts | MEDIUM | Enable `versions.drafts: true` on collections, wire up Next.js draft mode |
| Live Preview in admin panel | Payload's official template includes this; editors expect real-time visual feedback | MEDIUM | Uses iframe + postMessage; Payload provides `useLivePreview` hook |
| On-demand revalidation | Changes should appear immediately without full rebuild; ISR is table stakes for Next.js CMS | MEDIUM | `afterChange` hooks calling `revalidatePath` / `revalidateTag` |
| Rich text editor with embedded blocks | Content editing needs formatting, links, images inline; Payload Lexical editor handles this | LOW | Lexical is Payload's default; configure inline blocks for embeds |
| Responsive design / mobile-friendly output | Users expect sites to work on all devices | LOW | Tailwind v4 handles this; ensure block output uses responsive classes |
| Basic block types (Hero, Content, CTA, Media) | Payload official template ships 5 blocks; any starter needs at minimum these core sections | MEDIUM | Hero, Content, MediaBlock, CallToAction, Archive |
| Redirects management | URL management for migrations and SEO; Payload has official plugin | LOW | Use `@payloadcms/plugin-redirects` |
| Sitemap and robots.txt | SEO fundamentals; expected in any production website | LOW | Next.js App Router supports `sitemap.ts` and `robots.ts` natively |
| TypeScript throughout | Payload v3 is TypeScript-native; users of a modern starter expect full type safety | LOW | Payload generates types automatically |
| Dark mode support | Modern websites and admin panels support dark mode; Payload official template includes frontend dark mode | LOW | shadcn/ui has built-in dark mode; use CSS variables |

### Differentiators (Competitive Advantage)

Features that set this starter apart from Payload's official template and other CMS starters. These align with the project's core value of composable, Shopify-inspired nested block architecture.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Composable nested block system (Shopify-style) | Unlike the official template's flat block list, blocks nest inside each other -- sections are composed from atomic blocks, not rigid predefined structures. This is the core differentiator | HIGH | Atomic blocks (Heading, Paragraph, Image, Button, etc.) compose into sections. Shopify supports 8 levels of nesting; we should support at least 3-4 |
| Atomic block library (text, media, action, layout) | Granular building blocks that compose into anything -- Heading, Paragraph, List, Blockquote, Image, Video, Icon, Button, Link, Form embed, Container, Grid/Columns, Spacer, Divider | HIGH | ~14 atomic blocks. Each needs Payload config, frontend renderer, and style options |
| Pre-composed section presets | 5-8 ready-to-use sections (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) built FROM nested atomic blocks, not with custom fields. Users can modify the composition | MEDIUM | These are templates/presets that expand into nested blocks, not separate block types |
| Per-block style controls (Webflow-inspired, simplified) | Padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS per block. No other Payload starter offers this | HIGH | Simplified subset of Webflow's style panel. Use Payload tabs field to separate content/style/settings |
| Per-block settings tab | Block-type-specific settings (heading tag h1-h6, image aspect ratio, grid column count, etc.) in a dedicated settings tab | MEDIUM | Payload admin UI tabs: Content | Style | Settings |
| Templates collection for dynamic pages | Reusable layouts for collection item pages (single post, single product). Like Elementor's Theme Builder. No Payload starter has this | HIGH | Templates collection with block layouts + dynamic data binding. Applied to collection pages via template selection |
| Type-safe dynamic data binding | Block properties reference compatible collection fields only (text block binds to text fields, image block binds to upload fields). Prevents broken references at the type level | HIGH | Requires mapping block field types to collection field types. UI should filter available fields by compatibility |
| Integration point for Layout Customizer plugin | The existing payload-customiser project provides a Shopify-style visual editor with tree view, drag-drop, live preview. This starter is designed to work with it | MEDIUM | Plugin integration architecture -- the starter provides the block system, the plugin provides the visual editing UX |
| Integration point for Theme Settings plugin | Future plugin for managing shadcn theme variables (colors, spacing, fonts) from the admin panel | LOW | Design the CSS variable architecture now; plugin adds admin UI later |
| Cross-platform setup script | One command: creates Postgres DB, generates .env, installs deps, runs migrations. Works on Windows, macOS, Linux | MEDIUM | Node.js script (not bash) for cross-platform. Optional `--demo` flag for seed data |
| Postgres JSON block storage | Blocks stored as JSON in Postgres instead of relational tables. Avoids schema explosion with deeply nested blocks | LOW | Payload Postgres adapter supports this; configure `localized: false` on blocks field for JSON storage |
| Global block references | Payload feature to keep TypeScript schema clean with deeply nested block structures | LOW | Use Payload's block reuse/reference pattern to avoid type duplication |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for a starter template specifically.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full CSS property abstraction (Webflow-level) | "Let editors control everything visually" | Exponential complexity, breaks responsive design when editors set arbitrary values, enormous admin UI surface area, maintenance nightmare | Simplified subset: padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS escape hatch |
| Frontend authentication (login/register) | "Users should be able to log in" | Adds auth complexity, session management, security surface area to what is a content site starter. Most sites using this don't need frontend auth | Admin panel only. If auth needed, add it project-specifically |
| Real-time collaborative editing | "Multiple editors working simultaneously" | Massive implementation complexity (CRDT/OT), Payload doesn't natively support this, would require custom infrastructure | Payload's built-in document locking prevents conflicts; sequential editing is fine for content sites |
| Visual drag-and-drop in the default admin | "Move blocks around visually like Webflow" | The default Payload admin isn't designed for this; building it in-admin is fighting the framework. The external Layout Customizer plugin handles this properly | Use Payload's array field ordering for basic reordering; full visual editing via the Layout Customizer plugin |
| Vendor-specific deployment (Vercel-only features) | "Easy deploy to Vercel" | Vendor lock-in; contradicts VPS/Docker target. Vercel-specific APIs (edge middleware, image optimization) break on other platforms | Standard Next.js features only. Docker deployment support. Works everywhere |
| Seed data by default | "Show me what it looks like immediately" | Pollutes the database, users have to clean up before using. Confusing which content is theirs vs demo | Optional `--demo` flag in setup script. Clean install by default |
| E-commerce / payment processing | "Add a shop to my site" | Massive scope expansion. Payment processing, inventory, orders, shipping -- each is its own project | Provide Collection Grid block that can display any collection. E-commerce can be added project-specifically |
| Multi-language / i18n content | "Support multiple languages" | Adds complexity to every collection, block, and query. Payload supports it but it significantly increases schema complexity | Design blocks to be i18n-compatible (no hardcoded strings). Add localization project-specifically when needed |
| Form builder with complex logic | "Build any form with conditional fields" | Payload's Form Builder plugin handles basic forms. Complex conditional logic, multi-step forms, file uploads are deep rabbit holes | Use `@payloadcms/plugin-form-builder` for standard forms. Complex forms should be custom implementations |
| AI content generation | "Generate content with AI" | Rapidly changing landscape, API key management, model selection, prompt engineering -- all orthogonal to a block system starter | Leave as a future plugin possibility. The block system shouldn't depend on AI |

## Feature Dependencies

```
[Pages collection]
    └──requires──> [Block system (atomic blocks)]
                       └──requires──> [Per-block style system]
                       └──requires──> [Per-block settings system]
                       └──requires──> [Block renderers (frontend)]

[Pre-composed section presets]
    └──requires──> [Block system (atomic blocks)]

[Templates collection]
    └──requires──> [Block system (atomic blocks)]
    └──requires──> [Dynamic data binding]
                       └──requires──> [Type-safe field mapping]

[Posts collection]
    └──requires──> [Media collection]
    └──requires──> [Categories collection]

[Live Preview]
    └──requires──> [Block renderers (frontend)]
    └──requires──> [Draft mode setup]

[SEO]
    └──requires──> [Pages collection]
    └──requires──> [Posts collection]

[On-demand revalidation]
    └──requires──> [Pages collection]
    └──requires──> [Block renderers (frontend)]

[Layout Customizer plugin integration]
    └──requires──> [Block system (atomic blocks)]
    └──requires──> [Live Preview infrastructure]

[Setup script]
    └──independent (can be built at any phase)

[Navigation globals]
    └──requires──> [Pages collection] (for internal link references)
```

### Dependency Notes

- **Block system is the foundation:** Nearly everything depends on atomic blocks being defined first. This must be Phase 1.
- **Templates require dynamic data binding:** The Templates collection is meaningless without the ability to bind block properties to collection fields. These must be built together.
- **Pre-composed sections require atomic blocks:** Section presets are just arrangements of atomic blocks, so the atomic blocks must exist first.
- **Live Preview requires frontend renderers:** You cannot preview what doesn't render. Block renderers must be complete before Live Preview is meaningful.
- **Setup script is independent:** Can be developed in parallel with any phase since it deals with scaffolding infrastructure, not application logic.
- **Plugin integration points require stable block API:** The Layout Customizer and Theme Settings integration points need the block system's API to be settled before integration can be designed.

## MVP Definition

### Launch With (v1)

Minimum viable starter -- usable for building a real website with composable blocks.

- [ ] Atomic block library (all 14 blocks with Payload configs) -- the core building blocks
- [ ] Per-block style system (padding, margin, colors, custom CSS) -- what makes blocks flexible
- [ ] Per-block settings tab (block-type-specific options) -- what makes blocks configurable
- [ ] Block frontend renderers (React Server Components) -- blocks must actually render
- [ ] Pages collection with block-based layouts -- the primary use case
- [ ] Posts collection with categories -- standard content type
- [ ] Media collection -- required for Image/Video blocks
- [ ] Header and Footer globals -- navigation is essential
- [ ] SEO plugin integration -- table stakes for any website
- [ ] Draft mode and preview -- editors need to preview before publishing
- [ ] On-demand revalidation -- changes must appear immediately
- [ ] Redirects plugin -- URL management
- [ ] Postgres JSON block storage -- avoids schema explosion
- [ ] Basic responsive output -- sites must work on mobile

### Add After Validation (v1.x)

Features to add once the core block system is proven.

- [ ] Pre-composed section presets (Hero, CTA, Features, etc.) -- add when atomic blocks are stable and patterns emerge from real usage
- [ ] Live Preview in admin panel -- add when block renderers are complete and stable
- [ ] Templates collection for dynamic pages -- add when the block system API is settled
- [ ] Type-safe dynamic data binding -- add alongside Templates
- [ ] Cross-platform setup script -- add when the project structure is finalized
- [ ] Optional demo content -- add when section presets exist to showcase
- [ ] Layout Customizer plugin integration point -- add when block system API is stable
- [ ] Global block references for type cleanliness -- add when deeply nested structures are proven

### Future Consideration (v2+)

Features to defer until the starter is being used in real projects.

- [ ] Theme Settings plugin integration -- defer until shadcn theme variable patterns are established
- [ ] Form Builder plugin integration -- defer; forms are project-specific
- [ ] Search plugin integration -- defer; search needs are project-specific
- [ ] Nested Docs for pages (hierarchical page trees) -- defer; adds routing complexity
- [ ] Scheduled publishing -- defer; Payload supports via job queue but adds infrastructure

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Atomic block library (14 blocks) | HIGH | HIGH | P1 |
| Per-block style system | HIGH | HIGH | P1 |
| Per-block settings tab | HIGH | MEDIUM | P1 |
| Block frontend renderers | HIGH | HIGH | P1 |
| Pages collection with layouts | HIGH | LOW | P1 |
| Posts collection with categories | HIGH | LOW | P1 |
| Media collection | HIGH | LOW | P1 |
| Header/Footer globals | HIGH | LOW | P1 |
| SEO plugin | HIGH | LOW | P1 |
| Draft mode and preview | HIGH | MEDIUM | P1 |
| On-demand revalidation | MEDIUM | MEDIUM | P1 |
| Redirects plugin | MEDIUM | LOW | P1 |
| Postgres JSON storage | HIGH | LOW | P1 |
| Pre-composed section presets | HIGH | MEDIUM | P2 |
| Live Preview | HIGH | MEDIUM | P2 |
| Templates collection | HIGH | HIGH | P2 |
| Dynamic data binding | HIGH | HIGH | P2 |
| Setup script | MEDIUM | MEDIUM | P2 |
| Demo content | LOW | MEDIUM | P2 |
| Layout Customizer integration | MEDIUM | MEDIUM | P2 |
| Global block references | MEDIUM | LOW | P2 |
| Theme Settings integration | LOW | LOW | P3 |
| Form Builder integration | LOW | LOW | P3 |
| Search plugin | LOW | LOW | P3 |
| Nested Docs for pages | MEDIUM | MEDIUM | P3 |
| Scheduled publishing | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch -- the starter is broken without these
- P2: Should have, add when core is stable -- these are the differentiators
- P3: Nice to have, future consideration -- project-specific needs

## Competitor Feature Analysis

| Feature | Payload Official Template | WordPress + Elementor | Webflow | Our Approach |
|---------|--------------------------|----------------------|---------|--------------|
| Block system | Flat block list (5 blocks: Hero, Content, Media, CTA, Archive) | Widgets in sections/columns, predefined structures | Visual drag-drop elements, full CSS control | Nested composable atomic blocks (14 types), sections composed from blocks |
| Styling per block | None -- blocks have fixed styling | Style tab with spacing, colors, typography per widget | Full CSS panel per element (layout, typography, backgrounds, effects) | Simplified style tab: padding, margin, colors, border, text-size, custom CSS |
| Dynamic templates | None -- each page is manually built | Theme Builder: create templates for post types, archive pages | CMS Collection pages with dynamic bindings | Templates collection with type-safe field binding |
| Dynamic data binding | None | Dynamic Tags: insert field values into any widget property | CMS bindings: bind any element property to a collection field | Type-safe binding: block properties reference compatible collection field types only |
| Section presets | 5 fixed block types | 300+ pre-designed templates/sections | Designer-built components and layouts | 5-8 section presets that decompose into editable atomic blocks |
| Preview | Live Preview + Draft mode | Live preview in editor | Real-time visual editing | Draft mode + Live Preview (admin iframe) |
| SEO | Official SEO plugin | Yoast/RankMath plugins | Built-in SEO settings | Official Payload SEO plugin |
| Setup experience | `npx create-payload-app` | WordPress installer + plugin installation | Cloud signup | Cross-platform setup script: DB + env + deps + migrations |
| Self-hosting | Yes (Docker/VPS) | Yes (any PHP host) | No (SaaS only) | Yes (Docker/VPS, no vendor lock-in) |
| Code ownership | Full (open source) | Full (open source + plugins) | No (platform lock-in) | Full (open source, TypeScript throughout) |

## Sources

- [Payload CMS Official Website Template](https://github.com/payloadcms/payload/tree/main/templates/website) -- reference implementation for table stakes features
- [Payload Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks) -- block system capabilities
- [Payload Live Preview Documentation](https://payloadcms.com/docs/live-preview/overview) -- live preview architecture
- [Payload Drafts Documentation](https://payloadcms.com/docs/versions/drafts) -- draft mode setup
- [Shopify Theme Blocks Architecture](https://shopify.dev/docs/storefronts/themes/architecture/blocks) -- nested block nesting model (up to 8 levels)
- [Shopify Theme Block Nesting Architecture Guide](https://www.capaxe.com/blog/20251124-theme-block-nesting-architecture) -- nesting best practices and balance
- [Elementor Dynamic Content](https://elementor.com/features/dynamic-content/) -- dynamic data binding reference
- [Elementor Theme Builder](https://elementor.com/blog/introducing-theme-builder/) -- template system reference
- [Webflow Style Panel Overview](https://help.webflow.com/hc/en-us/articles/33961362040723-Style-panel-overview) -- per-element styling reference
- [PayloadBlocks.dev Community Library](https://www.payloadblocks.dev/) -- existing Payload block ecosystem (shadcn/ui + Tailwind)
- [shadcnblocks.com Payload CMS Boilerplate](https://www.shadcnblocks.com/payload-cms) -- community block library
- [Headless CMS Checklist for Developers](https://www.dotcms.com/blog/the-headless-cms-checklist-for-developers) -- must-have features for headless CMS
- [SEO Checklist for Developers 2025](https://strapi.io/blog/seo-checklist-for-developers) -- SEO requirements

---
*Feature research for: CMS website starter with composable block-based page builder (Payload CMS v3)*
*Researched: 2026-03-14*
