# Roadmap: Payload CMS Starter

## Overview

This roadmap delivers a composable, block-based Payload CMS v3 website starter in six phases. We start with the foundational infrastructure (database strategy, block registry pattern, project scaffold), then build the atomic block library, wire up collections and globals, layer on section presets and publishing workflows, integrate official plugins, and finish with developer experience tooling and deployment support. Each phase delivers a coherent, verifiable capability that the next phase depends on.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold with Payload + Next.js, PostgreSQL with blocksAsJSON, block registry pattern, Tailwind v4 + shadcn/ui (completed 2026-03-14)
- [x] **Phase 2: Atomic Blocks** - All 14 atomic blocks with per-block style options, settings tabs, and frontend renderers (completed 2026-03-14)
- [x] **Phase 3: Collections & Content** - Pages, Posts, Media, Template Parts (navigation), versions, auto-save, trash, and query presets (completed 2026-03-14)
- [x] **Phase 4: Sections & Publishing** - Pre-composed section presets, draft mode, live preview, revalidation, and sitemap (completed 2026-03-14)
- [x] **Phase 5: Plugins & Integrations** - Official Payload plugins and integration points for Layout Customizer and Theme Settings (completed 2026-03-14)
- [ ] **Phase 6: Developer Experience** - Cross-platform setup script, demo content, Docker deployment, and email configuration (gap closure in progress)

## Phase Details

### Phase 1: Foundation
**Goal**: A working Payload CMS + Next.js monolith with PostgreSQL blocksAsJSON storage, the block registry pattern established, and the frontend stack (Tailwind v4, shadcn/ui, RSC architecture) configured
**Depends on**: Nothing (first phase)
**Requirements**: BLCK-09, BLCK-10, CMS-05, DX-05, DX-06
**Success Criteria** (what must be TRUE):
  1. Payload admin panel loads at /admin and can create/edit test content
  2. PostgreSQL database uses blocksAsJSON storage — blocks are stored as JSONB, not relational tables
  3. Block registry exists with blockReferences and interfaceName patterns — adding a new block means adding it in one place
  4. Tailwind v4 CSS-first configuration works with shadcn/ui components rendering correctly
  5. Lexical rich text editor is configured and functional in the admin panel
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Scaffold from website template, strip template content, configure Payload core (blocksAsJSON, block registry, Lexical)
- [x] 01-02-PLAN.md — Frontend stack (Tailwind v4, shadcn/ui), initial migration, build verification

### Phase 2: Atomic Blocks
**Goal**: A complete library of 14 atomic blocks (text, media, action, layout) with per-block styling and settings, each rendering as React Server Components on the frontend
**Depends on**: Phase 1
**Requirements**: BLCK-01, BLCK-02, BLCK-03, BLCK-04, BLCK-05, BLCK-06, BLCK-07, BLCK-11
**Success Criteria** (what must be TRUE):
  1. All 14 atomic blocks (Heading, Paragraph, List, Blockquote, Image, Video, Icon, Button, Link, FormEmbed, Container, Grid/Columns, Spacer, Divider) can be added to a layout field in the admin panel
  2. Every block has a Styles tab where padding, margin, border-radius, border-width, text-size, background-color, text-color, and custom CSS can be configured
  3. Every block has a Settings tab with block-type-specific options (heading tag h1-h6, grid column count, etc.)
  4. Block row labels in the admin panel show icons, media thumbnails, or text content snippets for quick identification
  5. All blocks render on the frontend as React Server Components with their configured styles applied
**Plans:** 4/4 plans complete

Plans:
- [x] 02-01-PLAN.md — Style system infrastructure (styleFields, blockStyles mapper, link field, Tailwind safelist)
- [x] 02-02-PLAN.md — All 14 block Payload configs with Content/Styles/Settings tabs, registry population
- [x] 02-03-PLAN.md — All 14 block frontend RSC components, RenderBlocks wiring
- [x] 02-04-PLAN.md — BlockRowLabel admin component with icons, thumbnails, and text snippets for all 14 types

### Phase 3: Collections & Content
**Goal**: All content collections (Pages, Posts, Media, Template Parts) with versions, auto-save, trash, query presets, and frontend routing for pages and blog posts with template part-based header/footer navigation
**Depends on**: Phase 2
**Requirements**: COLL-01, COLL-02, COLL-03, COLL-04, COLL-05, COLL-06, COLL-07, COLL-08
**Success Criteria** (what must be TRUE):
  1. Pages can be created with block-based layouts and are accessible by slug on the frontend
  2. Posts can be created with categories, tags, and block content — post archive and single post pages render correctly
  3. Media uploads work with configured image sizes, focal point selection, and folder organization
  4. Header and footer navigation menus can be configured as Template Parts and render on the frontend
  5. Versions (max 50), auto-save (300-350ms for live preview), trash (soft delete), and query presets work across Pages and Posts
**Plans:** 3/3 plans complete

Plans:
- [ ] 03-01-PLAN.md — All Payload collections (Pages, Posts, Categories, Tags, Template Parts), SiteSettings global, access control, hooks, nested-docs plugin, payload.config wiring
- [ ] 03-02-PLAN.md — Link field upgrade to relationship (pages/posts), Link and Button component updates
- [ ] 03-03-PLAN.md — Frontend routing (catch-all pages, blog, homepage), template parts resolution, layout integration

### Phase 4: Sections & Publishing
**Goal**: Pre-composed section presets demonstrate the nested block system, and the full publishing workflow (drafts, live preview, revalidation, sitemap) is operational
**Depends on**: Phase 3
**Requirements**: BLCK-08, CMS-01, CMS-02, CMS-03, CMS-04
**Success Criteria** (what must be TRUE):
  1. 5-8 section presets (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) are available and each is composed from nested atomic blocks — no hardcoded section fields
  2. Draft mode works — unpublished changes are visible in preview but not on the live site
  3. Live preview in the admin panel updates as content is edited (supported by auto-save from Phase 3)
  4. Content changes trigger on-demand revalidation — published updates appear on the frontend without a full rebuild
  5. Sitemap.xml and robots.txt are generated and accessible
**Plans:** 2/2 plans complete

Plans:
- [ ] 04-01-PLAN.md — Publishing workflow: draft mode preview routes, live preview config, revalidation hooks, draft-aware page routes
- [ ] 04-02-PLAN.md — Sitemap/robots.txt generation and 8 section preset data structures

### Phase 5: Plugins & Integrations
**Goal**: Official Payload plugins are integrated and working, and the Layout Customizer is integrated directly into the starter with on-canvas block selection, while Theme Settings integration surface is documented
**Depends on**: Phase 4
**Requirements**: PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PLUG-06, PLUG-07, INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. SEO fields (title, description, image) are configurable per page/post and render as meta tags on the frontend
  2. Redirects can be created in the admin panel and work on the frontend (old URL redirects to new URL)
  3. Form Builder, Nested Docs, Import/Export, MCP, and Search plugins are installed and functional in the admin panel
  4. Layout Customizer is integrated with 3-pane editor (block tree + preview + field editor), on-canvas block selection, and _hidden block visibility
  5. Theme Settings plugin has a documented integration point — the starter identifies where theme variables would be managed
**Plans:** 3/3 plans complete

Plans:
- [ ] 05-01-PLAN.md — Install and configure 7 official Payload plugins (SEO, Redirects, Form Builder, Nested Docs, Import/Export, MCP, Search), SEO meta rendering, redirect middleware
- [ ] 05-02-PLAN.md — Copy and adapt Layout Customizer into src/views/customiser/, replace postMessage with RefreshRouteOnSave, register on collections
- [ ] 05-03-PLAN.md — On-canvas block selection (data-block-path, click/hover handlers), _hidden field, Theme Settings integration docs

### Phase 6: Developer Experience
**Goal**: A new developer can clone the repo, run a single setup script, and have a fully working local environment — with optional demo content and Docker deployment support
**Depends on**: Phase 5
**Requirements**: DX-01, DX-02, DX-03, DX-04
**Success Criteria** (what must be TRUE):
  1. Cross-platform setup script creates the Postgres database, generates .env, installs dependencies, and runs migrations on Windows, macOS, and Linux
  2. Running setup with --demo flag populates the database with sample pages, posts, media, and navigation
  3. Docker configuration builds and runs the application in a container with PostgreSQL
  4. AWS SES SMTP email is configured in the Payload config and sends transactional emails when credentials are provided
**Plans:** 5 plans (3 complete + 2 gap closure)

Plans:
- [x] 06-01-PLAN.md — Setup infrastructure: .env.example, @setup markers in payload.config.ts, SMTP email config, helper scripts (create-database, generate-env, modify-config, lexical-helpers)
- [x] 06-02-PLAN.md — Docker deployment: multi-stage Dockerfile, docker-compose.yml, .dockerignore
- [x] 06-03-PLAN.md — Interactive setup script with @clack/prompts, demo content seeder with section presets, package.json scripts
- [ ] 06-04-PLAN.md — [GAP] Template-based config generator (EJS), scaffold helper, replaces comment-toggling approach
- [ ] 06-05-PLAN.md — [GAP] Rewrite setup.ts for scaffold + template flow, remove @setup markers and old modify-config.ts

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete    | 2026-03-14 |
| 2. Atomic Blocks | 4/4 | Complete    | 2026-03-14 |
| 3. Collections & Content | 2/3 | Complete    | 2026-03-14 |
| 4. Sections & Publishing | 1/2 | Complete    | 2026-03-14 |
| 5. Plugins & Integrations | 3/3 | Complete    | 2026-03-14 |
| 6. Developer Experience | 3/5 | Gap Closure | 2026-03-15 |
| 6.1 Monorepo Restructure | 3/3 | Complete | 2026-03-15 |
| 7. Gap Closure & Cleanup | 0/2 | Planned | - |

### Phase 06.1: Restructure into payload-toolkit Turborepo monorepo (INSERTED)

**Goal:** Restructure payload-starter and create-payload-starter into a single Turborepo monorepo (payload-toolkit) with pnpm workspaces, shared utility package, and CLI updated to extract templates via GitHub codeload tarball
**Requirements**: N/A (inserted phase -- monorepo restructure)
**Depends on:** Phase 6
**Plans:** 3/3 plans complete

Plans:
- [x] 06.1-01-PLAN.md — Create monorepo root scaffold (Turborepo, pnpm workspaces), shared package, copy starter into apps/starter/
- [x] 06.1-02-PLAN.md — Migrate CLI into packages/create-payload-starter/, wire to @jon8800/shared, rewrite scaffold.ts for tarball extraction
- [x] 06.1-03-PLAN.md — Full build verification, GitHub repo creation, old repo archival

### Phase 7: v1.0 Gap Closure & Cleanup
**Goal:** Close audit gaps — functional FormEmbed frontend, missing env documentation, unused seed presets, dead code removal
**Requirements:** PLUG-03 (partial), DX-02 (partial), DX-04 (partial)
**Gap Closure:** Closes gaps from v1.0 milestone audit
**Depends on:** Phase 6.1
**Plans:** 2 plans

Plans:
- [ ] 07-01-PLAN.md — Functional FormEmbed frontend (RSC + client component for form rendering and submission)
- [ ] 07-02-PLAN.md — ADMIN_EMAIL env docs, wire unused seed presets, dead code cleanup
