---
title: Inject theme CSS variables via `<style>` in `<head>`, not inline on `<html>`
date: 2026-05-04
category: design-patterns
module: apps/starter
problem_type: design_pattern
component: tooling
severity: low
applies_when:
  - Cascading site-wide design tokens (colors, fonts, spacing, radius) from a CMS-managed source
  - Tokens come from a Payload global like ThemeSettings and need to reach `:root` at render time
  - Live preview of theme changes is a requirement
tags: [theming, css-variables, next-js, payload, ssr]
related_components: [tooling, documentation]
---

# Inject theme CSS variables via `<style>` in `<head>`, not inline on `<html>`

## Context

The ThemeSettings global derives a full shadcn variable palette from 7 input hex colors (via oklch conversion + hue rotation for chart colors), plus font, spacing, and radius tokens. These need to land on `:root` so every Tailwind v4 utility and every shadcn component picks them up. The natural impulse is to render `style={{ ['--primary']: '...' }}` directly on the `<html>` element in `app/layout.tsx`, but this fights Next.js's streaming and live preview.

## Guidance

In `app/layout.tsx`, render the derived tokens as a single `<style>` tag inside `<head>` that targets `:root`:

```tsx
const theme = await getThemeSettings()
const css = `:root {
  --primary: ${theme.colors.primary};
  --background: ${theme.colors.background};
  /* ... */
}`

return (
  <html lang="en">
    <head>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>{children}</body>
  </html>
)
```

Cache the derived CSS with `unstable_cache` keyed by the ThemeSettings updatedAt, and revalidate via `revalidateTag` from a Payload `afterChange` hook on the global. Live preview gets the same code path because the revalidation is event-driven.

## Why This Matters

- **Functionally equivalent to `style` on `<html>`.** Both set the variables on `:root`. The `<style>` tag form is what every CSS-in-Head solution uses (Next.js `next/font`, Tailwind preflight injection) and integrates cleanly with streaming.
- **Better with live preview.** Inline `style` on `<html>` is harder to update incrementally during a Payload livePreview session — the whole document re-renders. A `<style>` tag's text content can be diffed in place.
- **Cacheable.** A pure CSS string is trivial to cache. A React-rendered `style` prop is not as cleanly cacheable separately from the surrounding tree.
- **Documentation matches code.** During v1.1 there was a brief drift where the Phase 10-03 SUMMARY described inline `style` on `<html>` while the code used `<style>` in `<head>`. Either approach works — but pick one and document it. The `<style>` form is recommended.

## When to Apply

- Any time a CMS-managed theme global cascades tokens to `:root`
- Anywhere `unstable_cache` + `revalidateTag` would be used to invalidate the derived CSS
- Live preview wiring on theming globals

## Examples

The v1.1 ThemeSettings global ships this pattern in `apps/starter/src/app/(frontend)/layout.tsx`. The `deriveAllColors()` helper turns 7 hex inputs into the full shadcn variable set; the result is rendered as a single `<style>` block in `<head>`. The `/style-guide` preview page uses Payload's livePreview wiring to update the same pipeline live.

Anti-pattern that was rejected:

```tsx
// works but harder to cache and worse for live preview
<html style={{ ['--primary']: theme.colors.primary, /* ... */ }}>
```

## Related

- `docs/solutions/architecture-patterns/payload-admin-components-base-ui-scss-2026-05-04.md` — admin counterpart (uses Payload's CSS variables, not the frontend's)
