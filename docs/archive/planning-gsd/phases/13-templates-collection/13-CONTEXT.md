# Phase 13: Templates Collection, Opt-in & Admin UX — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Templates collection, the per-collection opt-in config pattern, the frontend route for Posts, the custom grouped admin list view, and seed a default Post template. No data binding yet (that's Phase 14) — Template blocks render with literal configured values only in this phase.

</domain>

<decisions>
## Implementation Decisions

### Template ownership direction
- **D-01:** Template-owns direction (not Collection-owns) — Templates declare their `targetCollection`; collections don't directly point to a default template. This matches Elementor/Shopify's pattern where templates carry their own applicability.
- **D-02:** For v1.2, a Template has exactly one `targetCollection` (singular). Multi-collection templates are deferred to v1.3+ (TMPL-MULTI-01).
- **D-03:** `isDefault` boolean on Template designates the fallback template for its `targetCollection`. Only one template per collection should be `isDefault: true` — enforced via a `beforeValidate` hook that clears the flag on other templates when one is set.

### Opt-in pattern
- **D-04:** Collections opt into templating via a Payload config flag. Syntax: `templates: { enabled: true }` at the collection config level. If omitted or false, the collection doesn't participate.
- **D-05:** Opt-in is **static** — set at config time, not runtime. No admin UI to toggle opt-in for v1.2.
- **D-06:** When `templates.enabled: true`, the collection automatically gains two admin-facing additions: (a) a `template` relationship field on its docs, filtered via a `filterOptions` callback to only show templates where `targetCollection` matches this collection's slug; (b) registration in the Templates collection's `targetCollection` dropdown options.
- **D-07:** Pages do NOT opt in. Pages keep their existing `layout` block field for author-composed page content. Templating Pages would be redundant indirection.
- **D-08:** For v1.2 Posts is the only opt-in collection. The pattern is designed to extend to future custom collections (Products, Events, etc.) by adding `templates: { enabled: true }` to their config.

### `targetCollection` dropdown population
- **D-09:** The dropdown is NOT a free-form text field. It's a `select` field whose options are generated at admin-bundle time from the set of opt-in collections (those with `templates.enabled: true` in their config).
- **D-10:** Implementation: a helper `getOptInCollections()` reads the Payload config at runtime (Payload config is available in Payload admin context) and returns `{ label: collection.labels.singular, value: collection.slug }` for each opt-in collection. Cached per admin session.

### Frontend route resolution (TMPL-03)
- **D-11:** New route at `apps/starter/src/app/(frontend)/posts/[slug]/page.tsx` — RSC, same shape as existing `(frontend)/[slug]/page.tsx` for Pages.
- **D-12:** Four-tier resolution chain:
  1. If `post.template` is set → render that template's `layout` blocks
  2. Else if a template exists for `targetCollection: 'posts'` with `isDefault: true` → render it
  3. Else if `post.layout` has ≥1 block → render `post.layout` directly (legacy path — authors who compose per-post layouts without templates still work)
  4. Else → render hardcoded fallback stack: Heading (from `post.title`) + Image (from `post.featuredImage`, if present) + Paragraph (from `post.excerpt`, if present)
- **D-13:** Tiers 1-2 render with literal block values only (no field binding) for this phase. Phase 14 activates bindings.
- **D-14:** Reuse existing `<RenderBlocks>` component from Pages — same component, same block components, no new render infra.
- **D-15:** Draft mode support: same pattern as Pages — `draftMode()` check, populate from drafts if enabled, wire into existing live-preview pipeline. Template changes in admin (when `livePreview` is configured on Templates in Phase 15) reflect on draft-mode posts that use that template.

### Custom grouped admin list view (TMPL-06)
- **D-16:** Templates collection has a custom `admin.components.views.list` component that replaces Payload's default list view.
- **D-17:** The view shows each opt-in collection (fetched via `getOptInCollections()`) as a section header. Under each: templates where `targetCollection == <section>`, with "is default" badge on the default template. An "Add new template for [Collection]" button per section pre-fills `targetCollection` when creating a new template.
- **D-18:** Pages don't appear in this view (not opt-in).
- **D-19:** If a collection has zero templates, still show the section header with just the "Add new template" button — no empty-state confusion.

### Admin grouping
- **D-20:** Templates collection lives under admin group "Design" (same group as Theme Settings). Rationale: Templates are a design-system concept, not everyday content editing.

### Seeded default Post template (TMPL-07)
- **D-21:** Seed runs as part of the existing `apps/starter/src/endpoints/seed.ts` / demo-content pipeline. One Template doc: `name: "Default Post"`, `targetCollection: "posts"`, `isDefault: true`, simple layout (Heading bound to title [binding Phase 14], Image bound to featuredImage, Paragraph for body).
- **D-22:** For v1.2 scope, the seeded template contains LITERAL placeholder block values (Phase 13 ships without bindings). The seed is ready to be upgraded with bindings once Phase 14 lands — we'll revisit the seed in Phase 14 or via quick task.
- **D-23:** Seeding is idempotent — skips if a Template with `name: "Default Post"` already exists.

### Claude's Discretion
- File naming and directory structure for the template field config (e.g., `apps/starter/src/collections/Templates.ts` placement)
- Select options caching strategy (admin-session vs build-time)
- Exact Payload admin component hooks used for the custom list view
- SCSS class naming for the grouped list view

</decisions>

<specifics>
## Specific Ideas

- Shopify theme customizer pattern for the grouped list view — collection type as header, templates listed under each, add-new button per group
- Elementor single-post template pattern — templates REPLACE post content rendering (not wrap it)
- The existing Pages route at `apps/starter/src/app/(frontend)/[slug]/page.tsx` is the shape reference for `/posts/[slug]`

</specifics>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` §v1.2 Templates Collection — TMPL-01 through TMPL-07
- `.planning/ROADMAP.md` §Phase 13 — Success criteria (6 items)

### Existing Code Insights
- `apps/starter/src/collections/Posts.ts` §112-115 — Posts already has a `layout` blocks field (tier 3 fallback)
- `apps/starter/src/collections/Pages.ts` — Reference for layout block field shape and existing RenderBlocks integration
- `apps/starter/src/globals/ThemeSettings.ts` §13-24 — Admin group "Design" pattern; livePreview config pattern to reuse in Phase 15
- `apps/starter/src/blocks/registry.ts` — `allBlockSlugs` export used by existing layout fields
- `apps/starter/src/endpoints/seed.ts` or equivalent — Seeding pipeline for TMPL-07
- `apps/starter/src/app/(frontend)/[slug]/page.tsx` — Shape reference for RSC Posts route

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<RenderBlocks>` component already exists and is used by Pages — reuse as-is for templates
- `allBlockSlugs` from block registry gives Templates access to the same 14 atomic blocks
- Posts already has `layout: blocks` field — natural tier-3 fallback path
- `@payloadcms/richtext-lexical` richText field type used across the project

### Established Patterns
- Payload collection config shape established across Pages, Posts, Media, TemplateParts, Categories, Tags
- Custom admin fields registered via `admin.components.Field` with `@/` path aliasing
- Blocks-as-JSON storage pattern (`blocksAsJSON: true` on collection) established in v1.0
- `draftMode()` + `payload.find({ draft })` pattern for live preview on Pages

### Integration Points
- New `Templates` collection registered in `apps/starter/src/payload.config.ts` alongside existing collections
- Posts collection config gets `templates: { enabled: true }` flag (new pattern)
- Templates collection `admin.components.views.list` gets custom view component path
- `/posts/[slug]/page.tsx` is net-new — no existing file

</code_context>

<deferred>
## Deferred Ideas

- Elementor-style conditional template application (apply to posts in Category X) — v1.3+ (TMPL-COND-01)
- Multiple `targetCollection` values per template — v1.3+ (TMPL-MULTI-01)
- Admin UI to toggle collection opt-in at runtime (not config-time) — not scoped
- Archive templates (list views like `/posts`, `/categories/[slug]`) — separate milestone
- Upgrading the seeded default Post template to use field bindings — revisit in Phase 14
- Authoring a Page template via this system — explicitly out of scope (Pages don't opt in)

</deferred>

---

*Phase: 13-templates-collection*
*Context gathered: 2026-04-18*
