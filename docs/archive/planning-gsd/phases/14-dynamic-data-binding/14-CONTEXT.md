# Phase 14: Dynamic Data Binding — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Block property values become bindable to fields on the current document. Admin gets an inline "bind" picker per input; render time resolves bound values server-side; literals remain the default for non-template contexts. One-hop nested binding and the Template admin preview are Phase 15 — this phase is flat-document binding only.

</domain>

<decisions>
## Implementation Decisions

### Binding data format
- **D-01:** Bindings are stored in a sibling `_bindings` object on the block JSON. Shape: `{ text: "Default headline", _bindings: { text: { field: "title" } } }`. Keeps block shape backward-compatible (bindings are additive, non-bound props untouched).
- **D-02:** NOT Handlebars-style inline markers like `{{title}}`. Reason: inline markers conflict with user text containing curly braces, and sibling-object format cleanly extends to nested binding in Phase 15 (`{ field: "author", nested: "name" }`).
- **D-03:** `_bindings` is a per-block object keyed by the property name being bound. Each entry is an object (not a string) so Phase 15 can add `nested` / `fallback` keys without another format migration.

### Admin UX — binding picker
- **D-04:** Inline bind icon next to each bindable input — subtle button that opens a dropdown/popover picker. NOT a separate "Bindings" tab in the block edit panel. Reason: keeps binding visible alongside the literal value so the author sees both at a glance.
- **D-05:** When an input is bound, its literal text input shows as "Bound to: [fieldName]" with a clear-binding (X) button. The literal value is preserved beneath (as the fallback) — revealed if the user clears the binding.
- **D-06:** Picker shows fields grouped by type: "Text fields," "Media," "Links & URLs," etc. — helps authors find what they can bind to.

### Type compatibility matrix
- **D-07:** Matrix defined as a static map in `apps/starter/src/lib/bindingCompatibility.ts`. Keyed by target-property type (block's prop), valued by an array of Payload field types that can bind to it:
  - `text` prop → `text`, `textarea`, `email`, `number` (coerced to string), `richText` (plaintext-extracted)
  - `imageSrc` prop → `upload` / media fields
  - `linkHref` prop → `text`, `URL`, `relationship` to doc with `slug` field (auto-resolves to `/{collection}/{slug}`)
  - `number` prop → `number`
  - `boolean` prop → `checkbox`
- **D-08:** Matrix is extensible — new block prop types or new Payload field types can be added by editing the map. Documented with inline comments.

### Rich-text binding to plain-text props
- **D-09:** When a `text`/string prop binds to a `richText` field, the resolver extracts plaintext using a helper (likely `@payloadcms/richtext-lexical` provides or we write a tiny walker). Preserves inline spaces, strips formatting.
- **D-10:** Rich-text → rich-text binding is NOT in scope for v1.2. Only plaintext extraction.

### Render-time resolution
- **D-11:** Resolution happens server-side during RSC render inside `<RenderBlocks>`. NOT client-side.
- **D-12:** `<RenderBlocks>` accepts a new optional prop: `documentContext?: { doc: any; collection: string }`. When present, blocks inside can resolve bindings against `doc`. When absent (e.g., Pages rendering), `_bindings` is ignored and literals are used.
- **D-13:** Resolution logic: for each block property name in `_bindings`, look up `doc[_bindings[prop].field]`. If value is null/undefined → use the literal from the block; else → use the resolved value (plaintext-extracted if richText, resolved-to-URL if relationship-to-slug).
- **D-14:** Resolution is shallow for this phase (top-level fields only). Nested traversal (relationships, groups beyond top level) is Phase 15.
- **D-15:** Top-level group fields ARE resolvable in this phase (they don't require a hop — they're inline data on the doc). e.g., `doc.meta.title` works. Relationships do NOT (Phase 15).

### Backward compatibility
- **D-16:** Blocks without `_bindings` key render exactly as before — literal values, same path. No migration.
- **D-17:** Blocks with `_bindings` rendered OUTSIDE a template context (Pages, existing uses) ignore `_bindings` and use literals. No error, no warning — bindings are inert outside templates.

### Admin field wrapping
- **D-18:** Every bindable input needs to wrap its existing component with a "BindableField" wrapper that adds the bind icon and manages the `_bindings` state. This wrapper is generic — takes the original field config + a compatibility-matrix lookup key.
- **D-19:** For v1.2, apply the BindableField wrapper to the common block props: Heading `text`, Paragraph `text`, Image `src`, Image `alt`, Link `href`, Link `label`, Button `label`, Button `href`. Other block props remain literal-only for v1.2 (expand in later milestones if needed).

### Claude's Discretion
- Exact picker popover positioning and styling (follow Base UI primitives used in v1.1)
- Plaintext extraction helper location and specific algorithm
- `_bindings` validation hook shape (ensure bound field exists on targetCollection)
- Whether to validate bindings at save time or runtime

</decisions>

<specifics>
## Specific Ideas

- The admin UX should feel like how WordPress/Elementor's "dynamic tags" work — a small indicator on the field that it's bound, with a picker that filters to compatible sources
- Type-safety is the key differentiator vs naive string substitution — picker must enforce compatibility, not just list all fields
- Rich text → plain text extraction is common; users will bind Heading text to posts' richText body fields often

</specifics>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` §v1.2 Dynamic Data Binding — BIND-01 through BIND-03, BIND-05 (BIND-04 is Phase 15)
- `.planning/ROADMAP.md` §Phase 14 — Success criteria (5 items)

### Prerequisite
- `.planning/phases/13-templates-collection/13-CONTEXT.md` — Phase 13 must ship the Templates collection, opt-in pattern, and Posts route before this phase can wire bindings into it

### Existing Code Insights
- `apps/starter/src/blocks/` — All 14 block component.tsx files need their bindable props updated to consume the resolved value from RenderBlocks' documentContext
- `apps/starter/src/components/RenderBlocks.tsx` (wherever it lives) — Gains `documentContext` prop
- `apps/starter/src/components/admin/StylesPanel.tsx` — Pattern reference for custom admin field wrappers (how we wrap/compose field UIs)
- `apps/starter/src/lib/themeUtils.ts` — Pattern for a static lookup/resolution helper (bindingCompatibility.ts follows similar shape)
- Base UI Popover used in ColorPicker — reuse for the bind-picker UI for consistency

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Base UI Popover + input pattern from v1.1 ColorPicker — reuse for bind-picker UI
- Payload's `useField` hook from `@payloadcms/ui` — used across admin components; BindableField wrapper uses it to manage `_bindings` state alongside the wrapped field's own state
- `StylesPanel` custom admin component pattern — shows how to compose multiple inputs in one JSON field; similar approach for `_bindings` object management
- Plaintext extraction utility may already exist somewhere in Payload/Lexical — check before writing custom

### Established Patterns
- Custom admin field components wrap Payload's `useField` hook to read/write block data
- `@layer payload-default` SCSS scoping established in v1.1 admin styling — use same for bind-picker popover
- Inline admin styles with Payload CSS variables established in v1.1

### Integration Points
- `RenderBlocks` component (used by both Pages and Posts template route) gets `documentContext` prop
- Each bindable block's `component.tsx` consumes `props.text` / `props.src` / etc. — these are now already resolved by the time they hit the component (RenderBlocks does resolution centrally)
- New shared file: `apps/starter/src/lib/bindingCompatibility.ts`
- New shared file: `apps/starter/src/lib/resolveBindings.ts`
- New shared admin component: `apps/starter/src/components/admin/BindableField.tsx`

</code_context>

<deferred>
## Deferred Ideas

- Relationship nested binding (`post.author.name`) — Phase 15 (BIND-04)
- Admin Template preview with sample document — Phase 15 (TMPL-04)
- Rich-text → rich-text binding (preserve formatting) — future milestone
- Computed/derived bindings (e.g., `post.title | uppercase`) — not scoped
- Bindable block props beyond the common set (e.g., Spacer height, Grid columns) — add as needed later
- Visual drag-drop binding UI — future milestone

</deferred>

---

*Phase: 14-dynamic-data-binding*
*Context gathered: 2026-04-18*
