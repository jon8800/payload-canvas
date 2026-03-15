---
phase: 05-plugins-integrations
plan: 03
subsystem: ui
tags: [postMessage, iframe, css-variables, block-selection, customiser]

requires:
  - phase: 05-plugins-integrations/02
    provides: Layout Customiser view with SelectedSectionContext
  - phase: 02-block-system
    provides: Block components and RenderBlocks renderer
provides:
  - On-canvas block selection via data-block-path attributes and postMessage
  - _hidden field on all blocks for visibility toggling
  - Block hover/selected highlight CSS
  - Theme Settings integration surface documentation
affects: [06-seed-polish, theme-settings-v2]

tech-stack:
  added: []
  patterns: [data-block-path attributes, postMessage iframe communication, display-contents wrapper, withHiddenField block decorator]

key-files:
  created:
    - src/components/BlockSelectionHandler.tsx
    - docs/THEME_INTEGRATION.md
  modified:
    - src/blocks/RenderBlocks.tsx
    - src/blocks/Container/component.tsx
    - src/blocks/Grid/component.tsx
    - src/blocks/shared.ts
    - src/blocks/registry.ts
    - src/views/customiser/index.client.tsx
    - src/app/(frontend)/layout.tsx
    - src/app/(frontend)/globals.css

key-decisions:
  - "display:contents wrapper for data-block-path to avoid layout interference"
  - "BlockSelectionHandler only activates inside iframe (window.self !== window.top)"
  - "Theme Settings plugin deferred to v2 -- documented integration surface only"

patterns-established:
  - "data-block-path: basePath.index pattern for block path addressing"
  - "withHiddenField decorator in registry for cross-cutting block fields"
  - "postMessage customiser-block-selected for iframe-to-parent communication"

requirements-completed: [INTG-01, INTG-02]

duration: 3min
completed: 2026-03-14
---

# Phase 5 Plan 3: On-Canvas Block Selection and Theme Integration Summary

**On-canvas block selection with data-block-path attributes, _hidden filtering, hover highlights, and Theme Settings CSS variable documentation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T13:25:13Z
- **Completed:** 2026-03-14T13:28:18Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- All rendered blocks emit data-block-path attributes for on-canvas selection targeting
- Clicking a block in the customiser preview iframe sends postMessage to select it in the tree sidebar
- Hovering over blocks in preview shows blue outline highlight
- _hidden blocks are filtered from frontend rendering
- Theme Settings integration surface documented with CSS variable mappings

## Task Commits

Each task was committed atomically:

1. **Task 1: Add data-block-path attributes, _hidden filtering, and block selection handler** - `efe1606` (feat)
2. **Task 2: Document Theme Settings integration surface** - `93b5ba5` (docs)

## Files Created/Modified
- `src/blocks/RenderBlocks.tsx` - Added basePath prop, _hidden filtering, data-block-path wrapper divs
- `src/blocks/Container/component.tsx` - Pass basePath to nested RenderBlocks
- `src/blocks/Grid/component.tsx` - Pass basePath to nested RenderBlocks
- `src/blocks/shared.ts` - Added hiddenField export (_hidden checkbox)
- `src/blocks/registry.ts` - withHiddenField decorator applied to all 14 blocks
- `src/components/BlockSelectionHandler.tsx` - Client component for iframe hover/click block selection
- `src/views/customiser/index.client.tsx` - postMessage listener for customiser-block-selected
- `src/app/(frontend)/layout.tsx` - BlockSelectionHandler rendered in draft mode
- `src/app/(frontend)/globals.css` - Hover and selected highlight CSS rules
- `docs/THEME_INTEGRATION.md` - Theme Settings CSS variable integration documentation

## Decisions Made
- Used `display: contents` on the data-block-path wrapper div to avoid affecting block layout
- BlockSelectionHandler only activates when page is loaded inside an iframe (customiser preview)
- Theme Settings full plugin implementation deferred to v2; documented integration surface only (INTG-02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- On-canvas block selection fully wired: click in preview selects in sidebar
- All customiser interactive features complete (Phase 5 done)
- Ready for Phase 6 seed data and polish

## Self-Check: PASSED

All created files verified on disk. Both task commits (efe1606, 93b5ba5) confirmed in git log.

---
*Phase: 05-plugins-integrations*
*Completed: 2026-03-14*
