---
title: Build Payload admin components with Base UI primitives + SCSS in @layer payload-default
date: 2026-05-04
category: architecture-patterns
module: apps/starter/admin
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Building any custom admin field component (color picker, font selector, slider, popover, etc.)
  - Custom admin components need to feel native to Payload's UI
  - Tailwind utilities are forbidden inside the admin context
tags: [payload, admin, base-ui, scss, tailwind-isolation]
---

# Build Payload admin components with Base UI primitives + SCSS in @layer payload-default

## Context

Custom admin components in this Payload v3 starter are built without Tailwind because the frontend uses Tailwind v4 with Preflight, and Preflight's reset leaks into the admin if Tailwind utilities are used there. Earlier attempts to style admin components with Tailwind classes caused visual breakage in Payload's native UI (button resets, list-style reset, anchor color reset). The starter needed a primitives layer that's headless, fully stylable, and visually consistent with Payload's own admin.

## Guidance

For every custom admin field component:

1. Use **Base UI** (the headless React primitives library) for behavior — `Popover`, `Slider`, `Combobox`, `Collapsible`, `Select`, `Dialog`. Never bring in shadcn/ui or any Tailwind-styled component into admin code.
2. Style with **SCSS modules** scoped under `@layer payload-default` so Payload's own styles take precedence by default and your overrides slot in cleanly.
3. Use **Payload CSS variables** (`var(--theme-elevation-*)`, `var(--theme-text)`, etc.) for colors and spacing — never hardcoded hex or pixel values. This makes light/dark theme switching free.
4. For Base UI popups that should match anchor width: combine `trackAnchorWidth` with `var(--anchor-width)` — Base UI exposes the anchor width as a CSS variable when this prop is set.

```scss
@layer payload-default {
  .colorPicker {
    background: var(--theme-elevation-50);
    color: var(--theme-text);
    border: 1px solid var(--theme-elevation-150);
  }

  .popover {
    width: var(--anchor-width); // matches Base UI anchor width
  }
}
```

## Why This Matters

Without the `@layer payload-default` wrapper, custom component styles either fight Payload's native CSS (causing visual inconsistency) or get overridden by it. Without CSS-variable-only styling, theme switching and Payload version upgrades break the components silently.

Bringing Tailwind into admin code reliably leaks Preflight resets and breaks Payload's UI in subtle ways (e.g., list bullets disappear, button defaults reset, link colors change). Base UI + SCSS keeps the admin context completely isolated from the frontend Tailwind layer.

## When to Apply

- Any new custom admin field component (lives under `apps/starter/src/admin/`)
- Any admin-side popover, modal, or interactive UI
- Admin component refactors

## Examples

The pattern is applied across all custom admin components shipped in v1.1: `ColorPicker` (with react-colorful), `FontSelector` (Combobox + 1908-font Google Fonts catalog), `SliderField` (Slider primitive), `StylesPanel` (Collapsible + Popover + Monaco editor). Each component imports from `@base-ui-components/react` and ships an adjacent `.module.scss` file scoped under `@layer payload-default`.

## Related

- `docs/solutions/design-patterns/two-pass-admin-component-redesign-2026-05-04.md` — the workflow that produced this pattern
- `docs/solutions/design-patterns/css-variable-injection-via-head-style-tag-2026-05-04.md` — sibling theming pattern for the frontend
