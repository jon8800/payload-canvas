# Roadmap: Payload CMS Starter

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-15) — [Full details](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Styling & Theming** — Phases 8-12.1 (shipped 2026-04-18) — [Full details](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Templates & Dynamic Content** — Phases 13-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-15</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 2: Atomic Blocks (4/4 plans) — completed 2026-03-14
- [x] Phase 3: Collections & Content (3/3 plans) — completed 2026-03-14
- [x] Phase 4: Sections & Publishing (2/2 plans) — completed 2026-03-14
- [x] Phase 5: Plugins & Integrations (3/3 plans) — completed 2026-03-14
- [x] Phase 6: Developer Experience (5/5 plans) — completed 2026-03-15
- [x] Phase 6.1: Monorepo Restructure (3/3 plans) — completed 2026-03-15
- [x] Phase 7: Gap Closure & Cleanup (2/2 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v1.1 Styling & Theming (Phases 8-12.1) — SHIPPED 2026-04-18</summary>

- [x] Phase 8: Frontend Styling Fix (1/1 plans) — completed 2026-03-15
- [x] Phase 9: Styles Panel (3/3 plans) — completed 2026-03-15
- [x] Phase 10: Theme Settings (3/3 plans) — completed 2026-03-15
- [x] Phase 11: Admin Component Redesign (2/2 plans) — completed 2026-03-15
- [x] Phase 12: UI Component Primitives (4/4 plans) — completed 2026-03-21
- [x] Phase 12.1: UI Iteration Fixes (INSERTED) (3/3 plans) — completed 2026-03-21

</details>

### 🚧 v1.2 Templates & Dynamic Content

- [ ] **Phase 13: Templates Collection & Frontend Route** — Templates collection with block layout field + `/posts/[slug]` rendering assigned template
- [ ] **Phase 14: Dynamic Data Binding** — Admin binding picker + render-time field resolution + type compatibility matrix
- [ ] **Phase 15: Nested Binding & Admin Preview** — One-hop relationship resolution + Template admin preview with sample document

## Phase Details

### Phase 13: Templates Collection & Frontend Route
**Goal**: Designers create Template documents with block layouts in admin, assign a default Template per collection, and Posts render their assigned Template at `/posts/[slug]` on the frontend
**Depends on**: v1.1 (block system + styles + theme all shipped)
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-05
**Success Criteria** (what must be TRUE):
  1. A `Templates` collection appears in admin with a block layout field using the same 14 atomic blocks available to Pages, plus name/description/target-collection-slug fields
  2. The Posts collection config references a "default template" (via a Payload relationship field to Templates) that can be selected or cleared in the admin
  3. Visiting `/posts/[slug]` on the frontend renders the blocks from the assigned Template (post's content fields are not yet bound — that's Phase 14)
  4. When a Post has no template assigned, `/posts/[slug]` renders a default block stack (title + content) rather than 404
  5. Post drafts render via the existing draft/live-preview pipeline when their Template changes

### Phase 14: Dynamic Data Binding
**Goal**: Block property values can be either literal (as today) OR bound to a field on the current document via an admin picker that enforces type compatibility; at render time, bound values resolve from the document
**Depends on**: Phase 13 (needs a template-rendering path to bind values into)
**Requirements**: BIND-01, BIND-02, BIND-03, BIND-05
**Success Criteria** (what must be TRUE):
  1. Any block property input in the admin offers a "bind to field" toggle or mode that opens a picker listing the target collection's fields
  2. The picker filters to compatible fields only — Heading text shows text/richText/string fields; Image src shows upload/media fields; Link href shows text/URL or relationship→doc-slug fields
  3. At render time within a template context, bound properties resolve to the current document's field value; when the field is missing or null, the block's literal default is used
  4. Blocks saved before v1.2 (no binding data) render identically to before — no migration needed for literal-only blocks
  5. Blocks outside a template context (e.g., on Pages) still work with literal values; binding is only active when rendering inside a Template

### Phase 15: Nested Binding & Admin Preview
**Goal**: Bindings can cross one collection relationship hop (e.g., `post.author.name`), and the Templates admin view includes a preview mode that renders the layout against a sample document so designers see filled-in results
**Depends on**: Phase 14
**Requirements**: BIND-04, TMPL-04
**Success Criteria** (what must be TRUE):
  1. The binding picker displays one level of nested fields via relationship fields (e.g., Post→author field → author's fields: name, email, avatar)
  2. Render-time resolution follows the relationship and returns the nested field value; cycles and missing relationships fall back to the literal default
  3. The Templates admin view has a "Preview" panel that lets the designer pick a sample document from the target collection and see the layout rendered with its data
  4. The preview updates live when the designer edits block values or binding targets in the Template admin view
  5. Preview mode is visibly distinct from the actual live preview (labeled "Template Preview — sample document: [Title]") so there's no confusion about what's being shown

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 (v1.0) | v1.0 | 24/24 | Complete | 2026-03-15 |
| 8-12.1 (v1.1) | v1.1 | 16/16 | Complete | 2026-04-18 |
| 13. Templates Collection & Frontend Route | v1.2 | 0/0 | Not started | — |
| 14. Dynamic Data Binding | v1.2 | 0/0 | Not started | — |
| 15. Nested Binding & Admin Preview | v1.2 | 0/0 | Not started | — |
