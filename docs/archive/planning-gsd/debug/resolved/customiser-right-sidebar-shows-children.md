---
status: resolved
trigger: "Right sidebar in Customiser view shows child/nested blocks instead of only showing the selected block's settings and styles"
created: 2026-03-22T00:00:00Z
updated: 2026-03-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - In DocumentFields.tsx line 100, the filter `field.type !== 'blocks'` only removes top-level blocks fields, but the children blocks field is nested inside a tabs > Content tab, so it passes through
test: Fix the filter to recursively strip blocks-type fields from within tabs
expecting: Right sidebar will show only Styles/Settings tabs without the Content tab's children blocks
next_action: Implement fix in DocumentFields.tsx

## Symptoms

expected: Right sidebar should exclusively show the selected block's Content/Styles/Settings tabs and page-level fields (Title, Slug, Published At, etc.). The left sidebar tree view should show the block hierarchy including all nested blocks.
actual: Right sidebar is showing child/nested blocks within the block settings area. For example, when viewing a Grid block, its child blocks appear in the right sidebar settings panel instead of only in the left sidebar tree.
errors: No console errors — layout/rendering issue
reproduction: 1) Open Payload admin, 2) Navigate to a page in the Customiser view, 3) Select a block that has children (e.g., Grid with nested blocks), 4) Observe the right sidebar — it shows child blocks inline instead of only showing the parent block's settings/styles.
started: Likely built this way — needs fix to match intended UX

## Eliminated

## Evidence

- timestamp: 2026-03-22
  checked: Grid/Container block config structure
  found: Blocks use a tabs field wrapping Content/Styles/Settings tabs. The children blocks field is inside the Content tab, not at the top level of the block's fields array.
  implication: The top-level filter `field.type !== 'blocks'` never matches the children field because it's nested inside a tabs > Content tab structure.

- timestamp: 2026-03-22
  checked: DocumentFields.tsx NestedBlockFields line 100
  found: Filter was `blockConfig.fields.filter((field) => field.type !== 'blocks')` - only filters top-level blocks fields
  implication: The tabs field (containing Content tab with children blocks) passes through the filter entirely, so RenderFields renders the nested blocks in the right sidebar.

## Resolution

root_cause: In DocumentFields.tsx, the filter to remove nested blocks from the right sidebar only checked top-level fields (`field.type !== 'blocks'`). But block configs like Grid/Container wrap their fields in a `tabs` field containing Content/Styles/Settings tabs. The `children` blocks field lives inside the Content tab, so the top-level filter never matched it, and RenderFields rendered child blocks in the right sidebar.
fix: Created `stripBlocksFields()` utility that recursively strips blocks-type fields from within tabs, groups, rows, and collapsibles. Tabs that become empty after stripping are removed entirely (e.g., the Content tab which only contained the children blocks field). Updated DocumentFields.tsx to use this utility instead of the shallow filter.
verification: Type-check passes. User confirmed in Chrome: selecting a Container block with children shows only Styles and Settings tabs in right sidebar -- no Content tab, no child blocks. Fix working as intended.
files_changed:
  - apps/starter/src/views/customiser/utils/findFields.ts
  - apps/starter/src/views/customiser/DocumentFields.tsx
