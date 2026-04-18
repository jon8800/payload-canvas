# Requirements: Payload CMS Starter

**Defined:** 2026-04-18
**Milestone:** v1.2 Templates & Dynamic Content
**Core Value:** Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates

## v1.2 Requirements

### Templates Collection

- [ ] **TMPL-01**: A `Templates` collection exists in the admin with a `layout` block field (same block system as Pages), plus fields for name, description, and target collection slug
- [ ] **TMPL-02**: Each collection (Posts, plus any future custom collections) can reference a default Template, selectable from admin
- [ ] **TMPL-03**: Posts frontend route at `/posts/[slug]` renders the assigned Template's block layout for the current post
- [ ] **TMPL-04**: Templates support an admin preview mode using a sample document so designers can see the layout filled with real data
- [ ] **TMPL-05**: Frontend fallback when no template is assigned — renders a default block stack (title + content) rather than 404

### Dynamic Data Binding

- [ ] **BIND-01**: Any block property (Heading text, Image src, Link href, etc.) can be bound to a field on the current document via a token/dropdown picker in the admin — not just a literal value
- [ ] **BIND-02**: The binding picker only shows fields whose types are compatible with the target property (Heading text ← text/richText/string; Image src ← upload/media; Link href ← text/URL or relationship→doc slug)
- [ ] **BIND-03**: At render time, bound properties resolve against the current document's data; missing/null fields fall back to the literal default configured in the block
- [ ] **BIND-04**: Type-safety works across one hop of nested collection relationships (e.g., `post.author.name` → Heading text)
- [ ] **BIND-05**: Existing non-bound blocks continue rendering from their literal values (backward compatible with v1.0/v1.1 block data)

## Future Requirements

### Search

- **SRCH-01**: Frontend search UI consuming the Search plugin (deferred from v1.1; scheduled v1.3)

### Loop / Repeater Blocks

- **LOOP-01**: A block type that renders a list of related documents (e.g., "latest posts," "related products") using a nested template — needs TMPL + BIND to exist first

### Admin Collection Builder

- **ADMIN-01**: Admin-side UX for defining new collections without code changes — not scoped yet

## Process Debt (carried from v1.1, deferred)

- Retrofit VERIFICATION.md for v1.1 phases 8, 12, 12.1
- Decide Nyquist validation posture — set up or disable `workflow.nyquist_validation`

## Out of Scope (v1.2)

| Feature | Reason |
|---------|--------|
| Frontend search UI (SRCH-01) | Deferred to v1.3; templates are higher priority |
| Loop / repeater blocks | Depends on TMPL + BIND; natural follow-up milestone |
| Admin-side collection builder | Collections remain code-defined for now |
| Multiple templates per collection (doc-level override) | v1.2 ships one default Template per collection; per-doc overrides deferred |
| Visual binding drag-drop UI | Token/dropdown picker only; visual binding is a future enhancement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMPL-01 | Phase 13 | Not started |
| TMPL-02 | Phase 13 | Not started |
| TMPL-03 | Phase 13 | Not started |
| TMPL-05 | Phase 13 | Not started |
| BIND-01 | Phase 14 | Not started |
| BIND-02 | Phase 14 | Not started |
| BIND-03 | Phase 14 | Not started |
| BIND-05 | Phase 14 | Not started |
| BIND-04 | Phase 15 | Not started |
| TMPL-04 | Phase 15 | Not started |

**Coverage:**
- v1.2 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after v1.2 roadmap creation*
