---
phase: quick
plan: 260321-rgz
subsystem: admin-ui
tags: [bugfix, uat, styles-panel, base-ui]
key-files:
  created: []
  modified:
    - apps/starter/src/components/admin/StylesPanel.tsx
    - apps/starter/src/components/admin/StylesPanel.scss
    - apps/starter/src/views/customiser/DocumentFields.scss
decisions:
  - "Replaced SpacingControl uniform/per-side toggle with SpacingBoxControl nested bounding box"
  - "Used items prop + modal={false} on Select.Root for value display and scroll fix"
metrics:
  duration: 1min
  completed: "2026-03-21"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 260321-rgz: Fix 4 UAT Issues Summary

Fixed Base UI Select value display, scroll lock, sidebar padding, and Webflow-style spacing bounding box in StylesPanel.

## What Was Done

### Task 1: Fix Select value display, scroll lock, and sidebar padding (f551c9b)

**ISSUE-1 (Select value not displaying):** Added `items={options}` prop to `Select.Root` in `StyledSelect` so Base UI can resolve value-to-label mapping and display the selected option label in the trigger.

**ISSUE-2 (Scroll lock):** Added `modal={false}` to `Select.Root` which prevents Base UI from adding `overflow: hidden` to the body element when dropdown is open.

**ISSUE-3 (Sidebar padding):** Added `padding-left: 0 !important` and `padding-right: 0 !important` to `&__sidebar-fields` in DocumentFields.scss.

### Task 2: Replace spacing controls with Webflow-style bounding box (50d9c28)

**ISSUE-4 (Spacing section):** Removed the old `SpacingControl` component (uniform/per-side toggle with select dropdowns) and replaced with `SpacingBoxControl` -- a nested CSS Grid bounding box with:
- Outer box: MARGIN label + 4 text inputs (top/right/bottom/left)
- Inner box: PADDING label + 4 text inputs (top/right/bottom/left)
- Dashed borders, dark theme variables, transparent inputs with hover/focus states

Also removed unused `UniformIcon` and `PerSideIcon` SVG components.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | f551c9b | fix(260321-rgz): fix Select value display, scroll lock, and sidebar padding |
| 2 | 50d9c28 | feat(260321-rgz): replace spacing controls with Webflow-style bounding box |

## Self-Check: PASSED

All modified files exist and both commits verified in git log.
