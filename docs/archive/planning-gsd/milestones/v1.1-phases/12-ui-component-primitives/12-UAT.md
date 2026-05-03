---
status: testing
phase: 12 + 12.1
started: 2026-03-21
updated: 2026-03-21
---

## Issues Found

### ISSUE-1: Base UI Select value not updating (CRITICAL)
Selecting an option from the dropdown does not update the trigger value. The `onValueChange` callback fires but the displayed value stays as "-". Root cause likely: Base UI Select v1.3.0 `onValueChange` signature mismatch — may need `(value, event)` destructuring or the value comparison fails.
Files: `apps/starter/src/components/admin/StylesPanel.tsx` (StyledSelect component, line ~195)

### ISSUE-2: Select popup locks page scrollbar
Opening a Base UI Select adds `overflow: hidden` to `<body>`, hiding the page scrollbar. Need to disable scroll locking via `Select.Portal` or `Select.Positioner` prop.
Files: `apps/starter/src/components/admin/StylesPanel.tsx`

### ISSUE-3: Left padding on sidebar-fields
`.document-fields__sidebar-fields` has 26px left padding from Payload's default styles. Need to override to 0.
Files: `apps/starter/src/views/customiser/DocumentFields.scss`

### ISSUE-4: Webflow bounding box for spacing
Replace current flat Padding/Margin selects with Webflow-style nested bounding box visual:
- Outer box = MARGIN (4 number inputs on edges)
- Inner box = PADDING (4 number inputs inside)
- Dark background, compact, centered
- Toggle to sync all sides
Reference: User-provided Webflow screenshot
Files: `apps/starter/src/components/admin/StylesPanel.tsx`, `StylesPanel.scss`

## Tests

### 1. StylesPanel Compact Layout
result: fail — ISSUE-1, ISSUE-3, ISSUE-4

### 2-12: [pending — blocked by ISSUE-1]

## Summary
total: 12
passed: 0
issues: 4
pending: 11
