# Phase 12 Iteration Feedback

**Captured:** 2026-03-21
**Source:** User visual inspection during checkpoint

## Bug Fixes

1. **Native selects → Base UI Select** — Replace all native browser `<select>` elements with Base UI Select component (spacing presets in StylesPanel, any other selects)
2. **FontSelector dropdown width** — Dropdown doesn't stretch to full input width, appears as small popup in the middle. Set width to match input/trigger width.
3. **Default color values** — Color pickers default to all black (#000000). Should default to the actual shadcn color values from frontend globals.css (e.g., --primary, --secondary, etc.)

## Enhancements

4. **Color wheel picker** — Replace preset-swatches-only picker with a color wheel + preset swatches. Library recommendation: `react-colorful` (2KB, zero deps) or `@uiw/react-color` (more variants).

## New Features

5. **Live preview for Theme Settings** — Add Payload live preview config to ThemeSettings global, same as Pages/Posts. Preview URL should point to a custom style guide preview page (not homepage) that shows components laid out in boxes — like a design system showcase.
