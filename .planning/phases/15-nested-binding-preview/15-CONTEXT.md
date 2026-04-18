# Phase 15: Nested Binding & Admin Preview — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend Phase 14's binding picker and resolver to support one hop of relationship traversal (e.g., `post.author.name`). Add an admin preview panel on the Templates collection that renders the layout against a user-selected sample document. This phase closes the v1.2 milestone.

</domain>

<decisions>
## Implementation Decisions

### Nested binding scope
- **D-01:** One hop of relationship traversal only — `post.author.name` (one `relationship` field hop). No two-hop (`post.author.team.name`).
- **D-02:** Groups/arrays are NOT hops — they're inline data on the same document. Unlimited depth into groups/arrays is allowed (e.g., `post.meta.seo.ogImage` is fine). Already partially supported by Phase 14's top-level group resolution; Phase 15 confirms and extends this to arbitrary depth within the document.
- **D-03:** Picker distinguishes visually between in-doc nesting (group/array) and relationship hops (e.g., different icon or section). One-hop limit applies only to relationships.

### Nested binding data format (extends Phase 14)
- **D-04:** Nested binding adds a `nested` key to the existing `_bindings` entry. e.g., `{ text: "Default", _bindings: { text: { field: "author", nested: "name" } } }`.
- **D-05:** For group/array traversal within the same document, use dot-path in `field`: `{ field: "meta.seo.title" }`. For relationship traversal, use `field` + `nested`: `{ field: "author", nested: "name" }`. The dual format makes hop count obvious in the stored data.
- **D-06:** Relationship `nested` path can itself be a dot-path into groups on the related doc (`{ field: "author", nested: "profile.bio" }`) — one relationship hop, then unlimited group traversal on the target.

### Relationship resolution
- **D-07:** Payload `depth: 1` on the Posts template-fetch query ensures relationships are populated with full docs (not just IDs). No extra fetch needed at render time for one-hop.
- **D-08:** Missing / null relationships fall back to the binding's literal default (same pattern as Phase 14 for missing fields).
- **D-09:** Cycles are impossible at one hop — not a concern for v1.2.

### Picker UI extensions
- **D-10:** The Phase 14 picker gets a new "nested" mode: when a user selects a `relationship` field, the picker expands to show the target collection's compatible fields. User picks one. Data stored as `{ field, nested }`.
- **D-11:** The picker determines the related collection from the field's `relationTo` config. If `relationTo` is a single collection, expand its fields. If `relationTo` is an array of collections (polymorphic), show only fields common to all (conservative) or the intersection.
- **D-12:** Depth indicator in picker UI — visually distinguish top-level fields from relationship-hop fields (e.g., indented, or "via [Collection]" subtitle).

### Admin preview (TMPL-04)
- **D-13:** Use Payload's built-in `admin.livePreview` on the Templates collection — same mechanism used for Pages, Posts, and ThemeSettings in v1.1. No custom preview iframe.
- **D-14:** Preview URL points to a dedicated route: `/_template-preview/[templateId]?doc=[sampleDocId]` — renders the Template's layout against the specified sample document.
- **D-15:** Sample document selection: a dropdown in the Templates admin edit view (custom field component) that lists docs from the Template's `targetCollection`. Selection is persisted in the preview URL as `?doc=[id]` so refresh preserves.
- **D-16:** If no sample doc is selected, the preview renders with a "Select a sample document" placeholder panel — not the template rendered with nulls.
- **D-17:** The preview URL's render route applies the same four-tier resolution as production rendering (doc.template → isDefault → doc.layout → fallback), BUT the Template being previewed is forced into tier 1 regardless of the sample doc's actual template assignment. This ensures authors see "what this template does," not "what the sample doc currently renders as."
- **D-18:** Preview route is labeled visually — a small banner at top of preview: `Template Preview — [TemplateName] applied to [CollectionSingular]: [SampleDocTitle]`. Reassures authors what they're seeing.
- **D-19:** Preview updates live as the author edits blocks or bindings in the Templates admin view — standard Payload live preview behavior via `useLivePreview` listener.

### Route protection
- **D-20:** The `/_template-preview/[templateId]` route is gated by `draftMode()` (authenticated admin user) — same protection as existing Pages/Posts live preview routes. Never publicly accessible.

### Claude's Discretion
- Exact picker visual treatment for relationship-hop fields (indentation depth, icons, subtitles)
- Sample-doc dropdown styling (follow v1.1 Base UI Select pattern)
- Template Preview banner design (colors, position) — follow admin aesthetic from v1.1
- Whether to memoize relationship field schemas or recompute per picker-open

</decisions>

<specifics>
## Specific Ideas

- Pattern to mirror: Payload's native live preview for Pages — same mechanism, same user experience, just pointed at a different route
- Elementor's preview pattern — a designer picks a sample post and sees the template rendered against real data; the sample is a stable reference while editing

</specifics>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` §v1.2 Dynamic Data Binding BIND-04 and §v1.2 Templates Collection TMPL-04
- `.planning/ROADMAP.md` §Phase 15 — Success criteria (5 items)

### Prerequisites
- `.planning/phases/13-templates-collection/13-CONTEXT.md` — Templates collection, Posts route, resolution chain
- `.planning/phases/14-dynamic-data-binding/14-CONTEXT.md` — `_bindings` format, BindableField wrapper, resolver infrastructure, compatibility matrix

### Existing Code Insights
- `apps/starter/src/globals/ThemeSettings.ts` §13-24 — `admin.livePreview` config pattern (livePreview URL function, preview route)
- `apps/starter/src/app/(frontend)/next/preview/route.ts` — Existing preview gateway (recently patched to allow globals in v1.1 post-audit fix); extend similarly for template preview
- `apps/starter/src/app/(frontend)/style-guide/page.tsx` — Reference for a non-document RSC route with LivePreviewListener
- Pages' and Posts' `admin.livePreview` configs — mirror the same shape for Templates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin.livePreview` pattern on ThemeSettings (v1.1, post-audit fix 23d3250 allowed globals to use it) — directly applicable to Templates collection
- `LivePreviewListener` from `@payloadcms/live-preview-react` — used on Pages/Posts/style-guide; reuse for template preview route
- Phase 14's `documentContext` prop on RenderBlocks — template preview route uses the same resolution with the sample doc as context
- BindableField wrapper and `_bindings` resolver from Phase 14 — extend for nested lookups

### Established Patterns
- Payload `depth: 1` on fetch for live-preview routes (populated relationships) — same setting for template preview
- Draft-mode gating on preview routes — consistent with Pages/Posts preview
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` tech-debt note: CSS variable injection via `<style>` in `<head>` — template preview inherits this, no new work

### Integration Points
- Templates collection config gets `admin.livePreview.url` + sample-doc picker field component (new custom admin field)
- New route: `apps/starter/src/app/(frontend)/_template-preview/[templateId]/page.tsx`
- New shared sample-doc picker component: `apps/starter/src/fields/templates/SampleDocPicker.tsx`
- `resolveBindings.ts` from Phase 14 gets a new function to handle `{ field, nested }` lookups following one relationship hop

</code_context>

<deferred>
## Deferred Ideas

- Two-hop relationships (`post.author.team.name`) — not scoped; one-hop sufficient for common patterns
- Preview routes for collections other than opt-in collections — only opt-in collections will have active templates; non-opt-in preview is pointless
- Preview comparison (side-by-side: literal vs bound rendering) — nice but out of scope
- Preview for archive/index pages (e.g., `/posts` list) — v1.2 is single-document templates only
- Offline preview (sample doc data hardcoded) — always use real docs

</deferred>

---

*Phase: 15-nested-binding-preview*
*Context gathered: 2026-04-18*
