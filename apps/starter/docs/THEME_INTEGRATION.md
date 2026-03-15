# Theme Settings Integration Surface

## Overview

The starter uses shadcn/ui CSS variables (OKLCH color space) for theming, defined in `src/app/(frontend)/globals.css`. A future Theme Settings plugin would provide an admin UI to manage these variables without code changes.

This document defines the integration surface -- the CSS variables a theme plugin would control and the recommended architecture for wiring it up.

## CSS Variables

The following CSS custom properties are defined on `:root` (light mode) and `.dark` (dark mode):

| Variable | Purpose |
|----------|---------|
| `--background` | Page background |
| `--foreground` | Default text color |
| `--card` / `--card-foreground` | Card surfaces |
| `--popover` / `--popover-foreground` | Popover surfaces |
| `--primary` / `--primary-foreground` | Primary brand color |
| `--secondary` / `--secondary-foreground` | Secondary brand color |
| `--muted` / `--muted-foreground` | Muted/subdued surfaces |
| `--accent` / `--accent-foreground` | Accent highlights |
| `--destructive` / `--destructive-foreground` | Error/danger states |
| `--border` | Border color |
| `--input` | Input border color |
| `--ring` | Focus ring color |
| `--radius` | Base border radius |
| `--chart-1` through `--chart-5` | Chart/data visualization colors |

Values use OKLCH color notation (e.g., `oklch(0.205 0 0)`).

## Integration Approach

A Theme Settings global would store color values and inject them as inline CSS variables on the `<html>` element, overriding the stylesheet defaults.

### Payload Global Config (future)

```typescript
import type { GlobalConfig } from 'payload'

const ThemeSettings: GlobalConfig = {
  slug: 'theme-settings',
  label: 'Theme Settings',
  access: { read: () => true },
  fields: [
    { name: 'primaryColor', type: 'text', label: 'Primary Color (OKLCH)' },
    { name: 'primaryForeground', type: 'text', label: 'Primary Foreground (OKLCH)' },
    { name: 'backgroundColor', type: 'text', label: 'Background (OKLCH)' },
    { name: 'foregroundColor', type: 'text', label: 'Foreground (OKLCH)' },
    { name: 'accentColor', type: 'text', label: 'Accent Color (OKLCH)' },
    { name: 'borderRadius', type: 'text', label: 'Border Radius' },
    // ... additional variables as needed
  ],
}
```

### Frontend Injection

The root layout would query the global and apply overrides:

```tsx
// src/app/(frontend)/layout.tsx
const themeSettings = await payload.findGlobal({ slug: 'theme-settings' })

const themeVars: Record<string, string> = {}
if (themeSettings.primaryColor) themeVars['--primary'] = themeSettings.primaryColor
if (themeSettings.backgroundColor) themeVars['--background'] = themeSettings.backgroundColor
// ... map each field to its CSS variable

<html style={themeVars}>
```

This approach keeps the CSS variable system intact while allowing admin-controlled overrides. No build step required -- changes take effect on next page load (or immediately with ISR revalidation).

## Block-Level Overrides

Individual blocks already support background-color and text-color via style options (defined in block configs). These produce inline styles that override theme defaults for specific blocks.

The hierarchy is: **CSS defaults < Theme Settings global < Block inline styles**.

## Implementation Status

- **Current:** CSS variables defined in `globals.css`, blocks use Tailwind color utilities that reference these variables
- **Deferred to v2:** Admin UI for Theme Settings global, color picker fields, live preview of theme changes
