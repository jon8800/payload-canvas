# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## customiser-right-sidebar-shows-children — Right sidebar shows child blocks instead of only selected block settings
- **Date:** 2026-03-22
- **Error patterns:** right sidebar, child blocks, nested blocks, Content tab, blocks field, tabs field, filter
- **Root cause:** In DocumentFields.tsx, the filter to remove nested blocks from the right sidebar only checked top-level fields (`field.type !== 'blocks'`). Block configs wrap fields in tabs (Content/Styles/Settings), so the children blocks field inside the Content tab was never matched by the shallow filter.
- **Fix:** Created recursive `stripBlocksFields()` utility in findFields.ts that strips blocks-type fields from within tabs, groups, rows, and collapsibles. Tabs that become empty after stripping are removed entirely.
- **Files changed:** apps/starter/src/views/customiser/utils/findFields.ts, apps/starter/src/views/customiser/DocumentFields.tsx
---

