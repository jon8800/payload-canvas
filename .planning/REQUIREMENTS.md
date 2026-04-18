# Requirements: Payload CMS Starter

**Defined:** 2026-04-18
**Milestone:** v1.2 Templates & Dynamic Content
**Core Value:** Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates

## v1.2 Requirements

### Templates Collection

- [ ] **TMPL-01**: A `Templates` collection exists in the admin with these fields: name, description, `targetCollection` (dropdown populated from opt-in collections — not a free-form slug), `isDefault` (boolean), and a `layout` block field using the same 14 atomic blocks as Pages
- [ ] **TMPL-02**: Collections opt into the templates system via a Payload config flag (e.g., `templates: { enabled: true }` in the collection config). Opt-in collections automatically gain a filtered `template` relationship field on each document — filtered so users only see templates where `targetCollection` matches that collection's slug. Pages do NOT opt in (Pages keep their existing direct `layout` block field).
- [ ] **TMPL-03**: Posts frontend route at `/posts/[slug]` renders with a three-tier template resolution: (1) use `doc.template` if set on the post, else (2) use the `isDefault` template for `posts` collection, else (3) hardcoded fallback stack (TMPL-05)
- [ ] **TMPL-04**: Templates admin view has a Preview panel that renders the layout against a user-selected sample document from the target collection (Phase 15)
- [ ] **TMPL-05**: Hardcoded fallback stack when no template resolves — renders post title as Heading + post content as Paragraph/RichText block — so `/posts/[slug]` never 404s on missing template
- [ ] **TMPL-06**: The Templates collection has a custom list view in admin that groups templates by their `targetCollection` — each opt-in collection appears as a section header with its templates listed beneath and an "Add new template for [Collection]" button per section (Shopify/Elementor-style breakdown). Pages are excluded from this view since Pages don't opt in.
- [ ] **TMPL-07**: The starter scaffold (demo content / create-payload-starter seeding) ships with one default Post template seeded on first setup — a simple Hero + Content layout so Posts render meaningfully out of the box without any manual template configuration

### Dynamic Data Binding

- [ ] **BIND-01**: Any block property (Heading text, Image src, Link href, etc.) can be bound to a field on the current document via a small inline "bind" icon next to each input that opens a field picker — not just a literal value. Binding data is stored in a sibling `_bindings` object on the block JSON (e.g., `{ text: "Default", _bindings: { text: { field: "title" } } }`)
- [ ] **BIND-02**: The field picker only shows fields whose types are compatible with the target property: text/string props ← `text`/`textarea`/`email`/`richText` (extracted plain text)/`number` (coerced); Image src ← `upload`/media fields; Link href ← `text`/`URL` or `relationship`-to-doc-with-slug (auto-resolves to `/collection/slug`)
- [ ] **BIND-03**: At render time within a template context, bound properties resolve against the current document's data; when the bound field is missing or null, the block's literal default is used. Resolution happens server-side during RSC render, not client-side.
- [ ] **BIND-04**: Picker supports one hop of relationship traversal (e.g., `post.author` → User collection fields: name, email, avatar) in addition to unlimited traversal through group/array fields on the same document (groups don't count as hops because no extra fetch needed). Payload `depth: 1` on the template-rendering fetch ensures one-hop relationships are populated without runtime extra fetches.
- [ ] **BIND-05**: Existing non-bound blocks (no `_bindings` key) render identically to v1.0/v1.1 — no migration needed for literal-only blocks. Blocks outside a template context (e.g., on Pages rendering with the same block types) ignore any `_bindings` data and use literals.

## Future Requirements

### Search

- **SRCH-01**: Frontend search UI consuming the Search plugin (deferred from v1.1; scheduled v1.3)

### Loop / Repeater Blocks

- **LOOP-01**: A block type that renders a list of related documents (e.g., "latest posts," "related products") using a nested template — needs TMPL + BIND to exist first

### Advanced Template Conditions (Elementor-style)

- **TMPL-COND-01**: Templates can declare conditions beyond `isDefault` — e.g., "apply to posts in Category X," "apply to posts tagged Y" — similar to Elementor's display conditions. v1.2 ships only `isDefault` + per-doc override.
- **TMPL-MULTI-01**: A single template targets multiple collections (not just one `targetCollection`) — deferred; v1.2 is one collection per template.

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
| Multiple templates per doc (doc-level advanced overrides beyond "pick one") | Per-doc `template` field can only hold one template; more complex overrides deferred |
| Visual drag-drop binding UI | Inline bind icon + dropdown picker only |
| Templates for Pages | Pages keep their existing direct `layout` block field; templating Pages is a silly indirection |
| Elementor-style conditional template application (category, tag, etc.) | `isDefault` + per-doc override sufficient for v1.2; conditions are a v1.3+ scope |
| Archive templates (list views like `/posts`, `/categories/[slug]`) | v1.2 covers single-document templates only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMPL-01 | Phase 13 | Not started |
| TMPL-02 | Phase 13 | Not started |
| TMPL-03 | Phase 13 | Not started |
| TMPL-05 | Phase 13 | Not started |
| TMPL-06 | Phase 13 | Not started |
| TMPL-07 | Phase 13 | Not started |
| BIND-01 | Phase 14 | Not started |
| BIND-02 | Phase 14 | Not started |
| BIND-03 | Phase 14 | Not started |
| BIND-05 | Phase 14 | Not started |
| BIND-04 | Phase 15 | Not started |
| TMPL-04 | Phase 15 | Not started |

**Coverage:**
- v1.2 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after v1.2 discussion (TMPL-06, TMPL-07 added; TMPL-01/02 revised for Template-owns direction and config-driven opt-in)*
